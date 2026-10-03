// test/asset-autofill.cjs — 复盘候选自动沉淀（#204）
//
// 背景（真实故障诊断）：库里 learning_assets = 0 张卡，而 debrief_drafts 里
// 躺着 4 份 status='open' 的草稿，含真实 chunk/word 候选。原因是
// captureAsset 的唯一触发点是用户在复盘面板手动确认——没点，资产链从未启动。
// 表现到用户那里就是「复习页有时候出不了词」。
//
// 本测试验证 debriefAutoArchive：
//   1) word 候选且已在词库 → 建资产 + 建卡
//   2) word 候选但不在词库 → 不建（lexeme_id 是外键，不能猜），留在草稿
//   3) chunk ≥3 词 → 建资产；<3 词 → 留草稿
//   4) grammar/concept/pronunciation → 一律不自动建（需人工判断）
//   5) 幂等：同一 draft 调两次不重复建卡
//   6) convClose 会自动触发归档（真实入口）
// 运行：node test/asset-autofill.cjs
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

function fresh() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "assetfill-"));
  return new Core(tmp);
}
function countAssets(core) {
  return core.user.prepare("SELECT COUNT(*) AS n FROM learning_assets").get().n;
}
function countAssetCards(core) {
  return core.user.prepare("SELECT COUNT(*) AS n FROM cards WHERE asset_id IS NOT NULL").get().n;
}

// ——— 1) word 候选在词库 → 沉淀 ——���
{
  const core = fresh();
  // 造一个词元（lexemes 需要 lemma）
  core.user.prepare("INSERT INTO lexemes (lemma, pos, sense, created_at) VALUES(?,?,?,?)")
    .run("serendipity", "n.", "意外发现珍奇事物的运气", Date.now());
  const lexId = core.user.prepare("SELECT id FROM lexemes WHERE lemma=?").get("serendipity").id;

  core.debriefPut({
    origin_kind: "reading", origin_ref: "1",
    candidates: [{ kind: "word", canonical: "serendipity", clicked: "serendipity", gloss: "意外发现珍奇事物的运气" }],
  });
  const r = core.debriefAutoArchive({ origin_kind: "reading", origin_ref: "1" });
  check("词库内 word 候选被沉淀", r.archived === 1, r);
  check("生成了 1 条资产", countAssets(core) === 1, countAssets(core));
  check("生成了资产卡（word 的 ASSET_CARD_TYPES 为空，故 0 张）", countAssetCards(core) === 0, countAssetCards(core));
  const a = core.user.prepare("SELECT asset_kind, canonical, lexeme_id FROM learning_assets").get();
  check("资产 kind=word 且挂上 lexeme_id", a && a.asset_kind === "word" && a.lexeme_id === lexId, a);
}

// ——— 2) word 不在词库 → 不自动建，留草稿 ———
{
  const core = fresh();
  core.debriefPut({
    origin_kind: "reading", origin_ref: "2",
    candidates: [{ kind: "word", canonical: "nonexistentword", gloss: "x" }],
  });
  const r = core.debriefAutoArchive({ origin_kind: "reading", origin_ref: "2" });
  check("词库外的 word 不自动建（外键不能猜）", r.archived === 0, r);
  check("没有产生资产", countAssets(core) === 0);
  const d = core.debriefGet("reading:2");
  check("草稿仍为 open 且候选保留", d.status === "open" && JSON.parse(d.candidates_json).length === 1, { status: d.status });
}

// ——— 3) chunk 长度阈值 ———
{
  const core = fresh();
  core.debriefPut({
    origin_kind: "conversation", origin_ref: "s1", session_key: "s1",
    candidates: [
      { kind: "chunk", canonical: "That sounds exciting", zh_intent: "听起来很棒" },
      { kind: "chunk", canonical: "go", zh_intent: "走" },
    ],
  });
  const r = core.debriefAutoArchive({ origin_kind: "conversation", origin_ref: "s1", session_key: "s1" });
  check("仅 ≥3 词的 chunk 被沉淀", r.archived === 1, r);
  const assets = core.user.prepare("SELECT canonical FROM learning_assets").all();
  check("沉淀的是长 chunk", assets.length === 1 && assets[0].canonical === "That sounds exciting", assets);
  check("chunk 建了 2 张卡（recall + cloze）", countAssetCards(core) === 2, countAssetCards(core));
  const d = core.debriefGet("conversation:s1");
  check("短 chunk 留在草稿", d.status === "open" && JSON.parse(d.candidates_json).length === 1);
}

// ——— 4) 需要人工判断的三类一律不自动建 ———
{
  const core = fresh();
  core.debriefPut({
    origin_kind: "shadow", origin_ref: "sh1",
    candidates: [
      { kind: "grammar", canonical: "现在完成时", gloss: "have/has + 过去分词" },
      { kind: "concept", canonical: "对比结构", gloss: "than vs as" },
      { kind: "pronunciation", canonical: "thirty", gloss: "θ" },
    ],
  });
  const r = core.debriefAutoArchive({ origin_kind: "shadow", origin_ref: "sh1" });
  check("grammar/concept/pronunciation 不自动建", r.archived === 0 && countAssets(core) === 0, r);
  const d = core.debriefGet("shadow:sh1");
  check("三者全部留在草稿等人工确认", JSON.parse(d.candidates_json).length === 3);
}

// ——— 5) 幂等 ———
{
  const core = fresh();
  core.user.prepare("INSERT INTO lexemes (lemma, pos, sense, created_at) VALUES(?,?,?,?)")
    .run("ephemeral", "adj.", "短暂的", Date.now());
  const mk = () => core.debriefPut({
    origin_kind: "reading", origin_ref: "3",
    candidates: [{ kind: "word", canonical: "ephemeral", gloss: "短暂的" }],
  });
  mk();
  const a1 = core.debriefAutoArchive({ origin_kind: "reading", origin_ref: "3" });
  check("首次归档 1 条", a1.archived === 1, a1);
  // 草稿已被置 done，重复调用不应再建
  const a2 = core.debriefAutoArchive({ origin_kind: "reading", origin_ref: "3" });
  check("重复调用不再建（草稿已 done）", a2.archived === 0, a2);
  check("资产总数仍为 1", countAssets(core) === 1, countAssets(core));
}

// ——— 6) 真实入口：convClose 自动触发 ———
{
  const core = fresh();
  const r0 = core.convCreate({ goal: "test", cefr: "C1", suggestedTurns: 1 });
  const key = r0.sessionKey || r0.session_key;
  core.user.prepare("INSERT INTO lexemes (lemma, pos, sense, created_at) VALUES(?,?,?,?)")
    .run("ubiquitous", "adj.", "无处不在的", Date.now());
  core.debriefPut({
    origin_kind: "conversation", origin_ref: key, session_key: key,
    candidates: [{ kind: "word", canonical: "ubiquitous", gloss: "无处不在的" }],
  });
  check("归档前资产为 0", countAssets(core) === 0);
  core.convClose({ sessionKey: key, activeMs: 1000 });
  check("convClose 自动沉淀了候选", countAssets(core) === 1, countAssets(core));
}

console.log(`\nasset-autofill: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);