// S11-a 复习卡一键回语境：getDue 必须带回 text_id（阅读卡有、考纲卡无）
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s11a-"));
const core = new Core(dir);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

const raw = "Researchers investigate complex methods every day. The methods require careful planning and clear evidence from experiments.";
const saved = core.annotateAndSave(raw, "回语境测试");
core.createNote({ word: "investigate", label: "word", phrase: "", sense: "v. 调查", textId: saved.text_id, offset: raw.indexOf("investigate") });
core.createNote({ word: "evidence", label: "word", phrase: "", sense: "n. 证据", textId: saved.text_id, offset: raw.indexOf("evidence") });
// 考纲/独立卡：无文章来源
core.createStandaloneNote({ word: "abandon", label: "word", phrase: "", sense: "v. 放弃" });

const due = core.getDue(20);
const byWord = Object.fromEntries(due.map((c) => [c.word, c]));
check("阅读卡带 text_id", byWord.investigate && byWord.investigate.text_id === saved.text_id,
  JSON.stringify(byWord.investigate && byWord.investigate.text_id));
check("第二张阅读卡同样带 text_id", byWord.evidence && byWord.evidence.text_id === saved.text_id);
check("阅读卡 full 为原句", /investigate/i.test(byWord.investigate.full || ""));
check("独立卡 text_id 为 null（不显示回语境按钮）", byWord.abandon && byWord.abandon.text_id === null,
  JSON.stringify(byWord.abandon && byWord.abandon.text_id));
check("所有卡都含 text_id 字段", due.every((c) => "text_id" in c));

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
