// 全量诊断-1b：细化判定，输出分类问题
const path = require("path"), fs = require("fs"), os = require("os");
const { Core } = require("../core.cjs");
const { DatabaseSync } = require("node:sqlite");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aud-"));
const core = new Core(dir);
const dict = new DatabaseSync(path.join(__dirname, "..", "data", "dict.sqlite"));

const rowOf = (w) => dict.prepare("SELECT frq,tag,exchange FROM words WHERE word=?").get(w);
// 真垃圾判定：零频、无 tag、且自身 exchange 没有 0:base 屈折声明
const isJunk = (w) => {
  const r = rowOf(w);
  if (!r) return "missing";
  if (Number(r.frq) > 0 || (r.tag || "")) return null;
  if (r.exchange && /(?:^|\/)0:[^/]+/.test(r.exchange)) return null; // ECDICT 自认屈折形
  return "junk";
};

// A) relatedWords top 1500
const top = dict.prepare("SELECT word FROM words WHERE frq>0 ORDER BY frq LIMIT 1500").all();
const junkByHead = [], funcFam = [];
for (const { word } of top) {
  const rel = core.relatedWords(word);
  const fam = rel.family.map(x => x.word);
  const isFunc = core.isFunctionLemma(word);
  for (const w of fam) {
    const j = isJunk(w);
    if (j === "junk") junkByHead.push(`${word} -> ${w} (${(rowOf(w).exchange||"")})`);
    else if (j === "missing") junkByHead.push(`${word} -> ${w} [词头不存在]`);
    if (isFunc) funcFam.push(`${word} -> ${w}`);
  }
}
console.log("A1 真垃圾 family 条目:", junkByHead.length);
junkByHead.slice(0, 40).forEach(x => console.log("  ", x));
console.log("A2 功能词仍给 family:", funcFam.length);
[...new Set(funcFam)].slice(0, 30).forEach(x => console.log("  ", x));

// B) meaningChoices 问题明细
const sample = dict.prepare("SELECT word FROM words WHERE frq BETWEEN 500 AND 30000 ORDER BY RANDOM() LIMIT 400").all();
const bIssues = [];
for (const { word } of sample) {
  const r = core.resolve(word, "word", null);
  if (!r) continue;
  let ch;
  try { ch = core.meaningChoices(r, word); } catch (e) { bIssues.push(`${word} threw ${e.message}`); continue; }
  if (!ch || !ch.options || ch.options.length !== 4) { bIssues.push(`${word} 选项数 ${ch && ch.options && ch.options.length}`); continue; }
  const keys = ch.options.map(o => o.key), zhs = ch.options.map(o => o.zh);
  if (new Set(keys).size !== 4) bIssues.push(`${word} key 重复`);
  if (new Set(zhs).size !== 4) bIssues.push(`${word} 译义重复: ${JSON.stringify(zhs)}`);
  if (!keys.includes(ch.answer)) bIssues.push(`${word} 无正确答案`);
  // 泄漏：错误项译义包含正确项译义文本
  const correctZh = ch.options.find(o => o.key === ch.answer)?.zh || "";
  for (const o of ch.options) if (o.key !== ch.answer && correctZh && (o.zh || "").includes(correctZh)) bIssues.push(`${word} 错误项含正确义: ${o.zh}`);
}
console.log("B meaningChoices 问题:", bIssues.length);
bIssues.slice(0, 30).forEach(x => console.log("  ", x));

dict.close();
core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
