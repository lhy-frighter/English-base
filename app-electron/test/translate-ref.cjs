// test/translate-ref.cjs — 翻译卡参考译文的取数链路（#205）
//
// 要保证的核心不变式：**「划词时你看到的那句译文」必须等于「复习时该填的那句译文」**。
// 两者若不同源，用户会觉得自己被判错了——而他并没有错。
//
// 取数优先级：文章 text_translations.pairs_json（reader 同源）> payload > 词典。
// 另外验证选半句（划词常只选部分）也能配上。
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

/** 造一个带配对译文的库，返回 { core, textId } */
function seeded() {
  const core = new Core(fs.mkdtempSync(path.join(os.tmpdir(), "tref-")));
  const raw = "The evidence is compelling. She stood up calmly.";
  const saved = core.annotateAndSave(raw, "T");
  // reader 侧的实际结构：pairs_json 是 [[en, zh], ...]
  const pairs = [["The evidence is compelling.", "证据很有说服力。"],
    ["She stood up calmly.", "她平静地站了起来。"]];
  core.user.prepare(`INSERT INTO text_translations
    (text_id, para_index, source_sha256, src_lang, dst_lang, engine, model_revision,
     translated_text, pairs_json, status, updated_at)
    VALUES(?,?,?,'en','zh','test','','',?,'ok',?)`)
    .run(saved.text_id, 0, "sha", JSON.stringify(pairs), Date.now());
  core.createNote({
    word: "evidence", label: "word", phrase: "", sense: "n. 证据",
    textId: saved.text_id, offset: raw.indexOf("evidence"),
  });
  return { core, textId: saved.text_id };
}

function translateCard(core) {
  return core.getDue(50).find((c) => c.card_type === "note_translate");
}

// ——— 1) 整句能取到配对译文 ———
{
  const { core } = seeded();
  const tr = translateCard(core);
  check("翻译卡存在", !!tr);
  check("取到文章配对译文", tr && tr.reference === "证据很有说服力。", tr && tr.reference);
  check("reference 与 answer 同源", tr && tr.reference === tr.answer, { r: tr?.reference, a: tr?.answer });
}

// ——— 2) 无译文时退化为空（前端会提示只能自评），不得编造 ———
{
  const core = new Core(fs.mkdtempSync(path.join(os.tmpdir(), "tref2-")));
  const raw = "A plain sentence without translation.";
  const saved = core.annotateAndSave(raw, "T2");
  core.createNote({ word: "plain", label: "adj.", phrase: "", sense: "adj. 朴素的", textId: saved.text_id, offset: 0 });
  const tr = translateCard(core);
  check("无译文时 reference 为空串而非编造", tr && tr.reference === "", tr && tr.reference);
}

// ——— 3) 译文损坏时不崩 ———
{
  const { core, textId } = seeded();
  core.user.prepare("UPDATE text_translations SET pairs_json='{BROKEN' WHERE text_id=?").run(textId);
  let tr = null, err = null;
  try { tr = translateCard(core); } catch (e) { err = e; }
  check("pairs_json 损坏不抛异常", !err, err && String(err));
  check("损坏时降级为空串", tr && tr.reference === "", tr && tr.reference);
}

// ——— 4) 半句选区也能配上（划词常只选部分）———
{
  const { core, textId } = seeded();
  // 直接问辅助方法：只给句子的后半截（划词常只选部分）
  const zh = core._sentenceTranslation(textId, "evidence is compelling");
  check("半句选区能配到译文", zh === "证据很有说服力。", zh);
}

// ——— 5) 跨文章不串味 ———
{
  const { core, textId } = seeded();
  const other = core.annotateAndSave("Another totally different line.", "T3");
  core.user.prepare(`INSERT INTO text_translations
    (text_id, para_index, source_sha256, src_lang, dst_lang, engine, model_revision,
     translated_text, pairs_json, status, updated_at)
    VALUES(?,?,?,'en','zh','test','','',?,'ok',?)`)
    .run(other.text_id, 0, "sha2", JSON.stringify([["Another totally different line.", "完全不同的一行。"]]), Date.now());
  const zh = core._sentenceTranslation(other.text_id, "The evidence is compelling.");
  check("在别的文章里查这句应查不到（不串味）", zh === "", zh);
  const zh2 = core._sentenceTranslation(textId, "The evidence is compelling.");
  check("在本文里查得到", zh2 === "证据很有说服力。", zh2);
}

// ——— 6) 占位句不建/不补翻译卡 ———
{
  const core = new Core(fs.mkdtempSync(path.join(os.tmpdir(), "tph-")));
  const r = core.createStandaloneNote({ word: "plain", label: "adj.", phrase: "", sense: "adj. 朴素的" });
  // createStandaloneNote 只建 3 张词级卡（recall/l_recog/spelling），本就不含翻译卡；
  // 这里断言的是「占位句不会因为新增题型而多出一张翻译卡」
  check("词表收录建 3 张（本来就没有翻译卡）", r.cards_created === 3, r.cards_created);
  const n = core.user.prepare("SELECT COUNT(*) n FROM cards WHERE note_id=? AND card_type='note_translate'").get(r.note_id).n;
  check("占位句不建翻译卡", n === 0, n);
  const m = core.backfillTranslateCards();
  check("迁移也不给占位句补卡", m.created === 0 && m.purged === 0, m);
}

// ——— 7) 迁移清洗历史遗留的占位句卡 ———
{
  const core = new Core(fs.mkdtempSync(path.join(os.tmpdir(), "tph2-")));
  const r = core.createStandaloneNote({ word: "plain", label: "adj.", phrase: "", sense: "adj. 朴素的" });
  core.user.prepare("INSERT INTO cards(note_id,card_type,due,state,created_at) VALUES(?,'note_translate',?,0,?)")
    .run(r.note_id, Date.now(), Date.now());
  check("脏卡已存在", core.user.prepare("SELECT COUNT(*) n FROM cards WHERE note_id=? AND card_type='note_translate'").get(r.note_id).n === 1);
  const m = core.backfillTranslateCards();
  check("迁移清掉 1 张占位句脏卡", m.purged === 1, m);
  check("清完为 0", core.user.prepare("SELECT COUNT(*) n FROM cards WHERE card_type='note_translate'").get().n === 0);
}

console.log(`\ntranslate-ref: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);