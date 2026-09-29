// AWL 学术词族回归：数据完整性、标注命中（含派生/美式拼写）、统计、牌组
"use strict";
const { Core } = require("../core.cjs");
const { AWL } = require("../awl-data.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "awl-test-"));
const core = new Core(dir);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

// 1. 数据完整性
check("AWL 词族 570", AWL.length === 570, AWL.length);
const subCount = {};
for (const f of AWL) subCount[f.s] = (subCount[f.s] || 0) + 1;
check("子表 1-9 各 60、10 为 30", Array.from({ length: 9 }, (_, i) => subCount[i + 1]).every((n) => n === 60) && subCount[10] === 30, JSON.stringify(subCount));
check("头词唯一", new Set(AWL.map((f) => f.h)).size === 570);

// 2. 标注命中：analyse 词族的派生与美式拼写都标 awl=1
const toks = core.annotate("The analytical framework analyzed data and derived an estimate.").filter((t) => t.label !== "punct");
const awlMarked = toks.filter((t) => t.awl).map((t) => t.text.toLowerCase());
check("analytical 命中 AWL", awlMarked.includes("analytical"), awlMarked);
check("美式 analyzed 命中 AWL", awlMarked.includes("analyzed"), awlMarked);
check("derived 命中（derive 词族）", awlMarked.includes("derived"), awlMarked);
check("非学术通用词不标 AWL", (() => {
  const t2 = core.annotate("The quick brown fox jumps.").filter((t) => t.label !== "punct");
  return t2.every((t) => !t.awl);
})());

// 3. 统计含 awlTokens/awlRate
const saved = core.annotateAndSave("The researchers analyzed the data with a novel analytical approach.", "t");
check("stats 含 awlTokens 与 awlRate", saved.stats.awlTokens >= 3 && saved.stats.awlRate > 0, saved.stats);

// 4. 牌组总览
const list = core.syllabusList();
const awlDeck = list.find((d) => d.tag === "awl");
check("牌组含 awl 且 total=570", awlDeck && awlDeck.total === 570 && awlDeck.learned === 0, awlDeck);

// 5. 牌组词表：分页、子表号、按子表排序
const p1 = core.syllabusWords({ tag: "awl", offset: 0 });
check("awl 牌组分页 100 条", p1.page === 100 && p1.total === 570 && p1.rows.length === 100, { total: p1.total, n: p1.rows.length });
check("首条来自子表 1", p1.rows[0].sub === 1 && p1.rows[0].word, p1.rows[0]);
check("awl 牌组带中文释义（join ECDICT）", !!p1.rows.find((r) => r.gloss), p1.rows.slice(0, 3));

// 6. 学过词族成员后牌组 learned 翻转
const r = core.resolve("analysis", "word", null);
check("analysis 可解析", !!r);
if (r) {
  core.upsertLexeme(r, 0);
  const deck2 = core.syllabusList().find((d) => d.tag === "awl");
  check("学过 analysis 后 analyse 词族计为已学", deck2.learned === 1, deck2);
}

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
