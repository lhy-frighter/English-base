// test/translate-card.cjs — 句子翻译卡（note_translate）端到端（#205）
//
// 覆盖三件事：
//   1) 建卡：阅读页建词时同时生成 1 张翻译卡（共 6 张）；
//   2) 取卡：getDue 正确返回 sentence/reference，且同一笔记的兄弟卡互埋；
//   3) 迁移：既有笔记补建翻译卡（存量库里已有的卡没有翻译题）。
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { Core } = require("../core.cjs");

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("PASS", name); }
  else { fail++; console.error("FAIL", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}
const fresh = () => new Core(fs.mkdtempSync(path.join(os.tmpdir(), "tcard-")));
// 真实入口是 createNote（内部 resolve 词形 → upsertLexeme → 建 note+卡）。
// 它会校验原文存在，所以先造一篇 text。
function seedArticle(core, raw) {
  const now = Date.now();
  core.user.prepare("INSERT INTO texts (title, raw_text, created_at) VALUES(?,?,?)")
    .run("T", raw, now);
  return core.user.prepare("SELECT id FROM texts ORDER BY id DESC LIMIT 1").get().id;
}

// ——— 1) 建卡含翻译卡 ———
{
  const core = fresh();
  const tid = seedArticle(core, "She is remarkably resilient. She bounces back.");
  const r = core.createNote({ word: "resilient", label: "adj.", phrase: "", sense: "有韧性的", textId: tid, offset: 0 });
  check("建卡返回 6 张", r.cards_created === 6, r.cards_created);
  const types = core.user.prepare("SELECT card_type FROM cards WHERE note_id=?").all(r.note_id).map((x) => x.card_type);
  check("含 note_translate", types.includes("note_translate"), types);
  check("原有 5 种词级题型仍在",
    ["r_recog", "cloze", "recall", "l_recog", "spelling"].every((t) => types.includes(t)), types);
}

// ——— 2) getDue 正确返回翻译卡 ———
{
  const core = fresh();
  const tid = seedArticle(core, "The trait is ubiquitous in nature.");
  core.createNote({ word: "ubiquitous", label: "adj.", phrase: "", sense: "无处不在的", textId: tid, offset: 0 });
  const q = core.getDue(20);
  const tr = q.find((c) => c.card_type === "note_translate");
  check("队列里能取到翻译卡", !!tr, q.map((c) => c.card_type));
  check("翻译卡正面是英文句子（非空白）", tr && tr.sentence.trim().length > 0, tr && tr.sentence);
  check("翻译卡正面含目标词", tr && tr.sentence.includes("ubiquitous"), tr && tr.sentence);
  check("翻译卡带 reference 字段（字符串）", tr && typeof tr.reference === "string", tr && tr.reference);
  const sameNote = tr ? q.filter((c) => c.note_id === tr.note_id) : [];
  // 翻译卡按设计豁免互埋（考的是整句翻译，与词卡不同维度），故同笔记出 2 张：
  // 一张词级 + 一张句子级。词级之间仍然互埋。
  check("同笔记出 2 张：1 词级 + 1 翻译", sameNote.length === 2, sameNote.map((c) => c.card_type));
  check("其中翻译卡恰好 1 张", sameNote.filter((c) => c.card_type === "note_translate").length === 1);
  check("其中词级卡恰好 1 张（仍互埋）", sameNote.filter((c) => c.card_type !== "note_translate").length === 1);
}

// ——— 3) 幂等：重复建卡不重复建翻译卡 ———
{
  const core = fresh();
  const tid = seedArticle(core, "He is meticulous about detail.");
  const o = { word: "meticulous", label: "adj.", phrase: "", sense: "一丝不苟的", textId: tid, offset: 0 };
  const a = core.createNote(o);
  const b = core.createNote(o);
  check("重复建卡返回 already", b.already === true, b);
  const n = core.user.prepare("SELECT COUNT(*) n FROM cards WHERE note_id=? AND card_type='note_translate'").get(a.note_id).n;
  check("翻译卡只有一张", n === 1, n);
}

// ——— 4) 迁移：既有笔记补建 ———
{
  const core = fresh();
  const tid = seedArticle(core, "Fame is ephemeral in the end.");
  core.createNote({ word: "ephemeral", label: "adj.", phrase: "", sense: "短暂的", textId: tid, offset: 0 });
  core.user.prepare("DELETE FROM cards WHERE card_type='note_translate'").run();
  check("删除后为 0（模拟存量库）",
    core.user.prepare("SELECT COUNT(*) n FROM cards WHERE card_type='note_translate'").get().n === 0);
  const m = core.backfillTranslateCards();
  check("每个有句子的笔记补 1 张", m.created === 1, m);
  check("补建后总数为 1",
    core.user.prepare("SELECT COUNT(*) n FROM cards WHERE card_type='note_translate'").get().n === 1);
  const again = core.backfillTranslateCards();
  check("重复迁移不重复建（幂等）", again.created === 0, again);
}

console.log(`\ntranslate-card: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);