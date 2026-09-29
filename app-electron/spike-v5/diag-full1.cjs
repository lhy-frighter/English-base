// 全量诊断-1：relatedWords/meaningChoices/canonical/annotate 在高频词与真实语料上的异常扫描
const path = require("path"), fs = require("fs"), os = require("os");
const { Core } = require("../core.cjs");
const { DatabaseSync } = require("node:sqlite");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aud-"));
const core = new Core(dir);
const dict = new DatabaseSync(path.join(__dirname, "..", "data", "dict.sqlite"));

let issues = [];
const log = (sev, area, msg) => issues.push({ sev, area, msg });

// A) relatedWords 扫 top 1500 高频词
const top = dict.prepare("SELECT word,pos,frq FROM words WHERE frq>0 ORDER BY frq LIMIT 1500").all();
for (const r of top) {
  let rel;
  try { rel = core.relatedWords(r.word); } catch (e) { log("P0", "related", `${r.word} threw ${e.message}`); continue; }
  const fam = (rel.family || []).map(x => x.word || x), syn = (rel.synonyms || []).map(x => x.word || x);
  if (fam.includes(r.word)) log("P1", "related", `${r.word} family 含自身`);
  if (new Set(fam).size !== fam.length) log("P1", "related", `${r.word} family 重复 ${JSON.stringify(fam)}`);
  if (new Set(syn).size !== syn.length) log("P2", "related", `${r.word} synonyms 重复`);
  if (syn.includes(r.word)) log("P1", "related", `${r.word} synonyms 含自身`);
  for (const w of fam) {
    if (w.length < 2) log("P0", "related", `${r.word} family 垃圾 "${w}"`);
    const row = dict.prepare("SELECT frq,tag FROM words WHERE word=?").get(w);
    if (!row) log("P0", "related", `${r.word} family 词头不存在: ${w}`);
    else if (!(Number(row.frq) > 0) && !row.tag) log("P1", "related", `${r.word} family 零频无tag: ${w}`);
  }
}
console.log("A relatedWords 扫描", top.length, "词, 累计问题", issues.length);

// B) meaningChoices 300 随机词
const sample = dict.prepare("SELECT word FROM words WHERE frq BETWEEN 500 AND 30000 ORDER BY RANDOM() LIMIT 300").all();
for (const { word } of sample) {
  const r = core.resolve(word, "word", null);
  if (!r) continue;
  let ch;
  try { ch = core.meaningChoices(r, word); } catch (e) { log("P0", "choices", `${word} threw ${e.message}`); continue; }
  if (!ch || !ch.options || ch.options.length !== 4) { log("P0", "choices", `${word} 选项数 ${ch && ch.options && ch.options.length}`); continue; }
  if (new Set(ch.options.map(o => o.key)).size !== 4) log("P0", "choices", `${word} key 重复`);
  if (new Set(ch.options.map(o => o.zh)).size !== 4) log("P1", "choices", `${word} 译义重复 ${JSON.stringify(ch.options.map(o => o.zh))}`);
  if (!ch.options.find(o => o.key === ch.answer)) log("P0", "choices", `${word} 无正确答案`);
}
console.log("B meaningChoices 扫描", sample.length, "词, 累计问题", issues.length);

// C) canonical 对带 0:base 标记的屈折词头抽样 2000
const infl = dict.prepare("SELECT word,exchange FROM words WHERE exchange LIKE '0:%' ORDER BY RANDOM() LIMIT 2000").all();
let cBad = 0; const cExamples = [];
for (const { word, exchange } of infl) {
  const m0 = exchange.match(/(?:^|\/)0:([^/]+)/);
  if (!m0) continue;
  const base = m0[1].toLowerCase();
  const got = core.canonical(word);
  if (got !== base && core.words.has(base)) { cBad++; if (cExamples.length < 15) cExamples.push(`${word} -> ${got} (期望 ${base})`); }
}
console.log("C canonical 屈折还原不一致:", cBad, "/", infl.length);
cExamples.forEach(e => console.log("  ", e));

// D) annotate：内置素材偏移量 + miss 误判（miss 但 canonical 命中高频词）
const builtins = require(path.join(__dirname, "..", "data", "builtins.cjs"));
let offBad = 0, missCommon = 0; const missEx = [];
let tokenCount = 0;
for (const b of builtins) {
  const text = b.text || "";
  const ann = core.annotate(text);
  for (const t of ann) {
    if (t.label === "punct") continue;
    tokenCount++;
    if (text.slice(t.start, t.start + t.text.length) !== t.text) { offBad++; if (offBad <= 5) console.log("OFFSET BAD", b.id, t.text, t.start); }
    if (t.label === "miss") {
      const c = core.canonical(t.text.toLowerCase());
      if (c && core.words.has(c)) { const row = core.lookupWordRow(core.words.get(c), c); if (row && Number(row.frq) > 5000) { missCommon++; if (missEx.length < 15) missEx.push(`${t.text}(${c}) in ${b.id}`); } }
    }
  }
}
console.log("D 内置素材 tokens:", tokenCount, "偏移错误:", offBad, "miss 但实为高频词:", missCommon);
missEx.forEach(e => console.log("  ", e));

dict.close();
core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log("\n问题总数:", issues.length);
issues.slice(0, 80).forEach(i => console.log(i.sev, i.area, i.msg));
