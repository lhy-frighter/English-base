// 诊断：relatedWords 在高频词/短词/AWL 上的假同根与假近义
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "diag-"));
const core = new Core(dir);

// 候选样本：frq 前 3000 + 考纲短词(<=4) + AWL 头词
const words = core.user.prepare(
  `SELECT word FROM dict.words WHERE frq IS NOT NULL AND frq>0 ORDER BY frq LIMIT 3000`
).all().map((r) => r.word);
for (const r of core.user.prepare(
  `SELECT word FROM dict.words WHERE length(word)<=4 AND tag<>'' AND frq IS NOT NULL ORDER BY frq LIMIT 800`
).all()) if (!words.includes(r.word)) words.push(r.word);
for (const fam of require("../awl-data.cjs").AWL) if (!words.includes(fam.h)) words.push(fam.h);

console.log("样本词数", words.length);
let famBad = 0, synBad = 0;
const famExamples = [], synExamples = [];
for (const w of words) {
  const r = core.relatedWords(w);
  // 同根可疑：候选与词头共享前缀不足 5 字符，或长度差 >6
  for (const f of r.family) {
    const common = (() => { let k = 0; while (k < w.length && k < f.word.length && w[k] === f.word[k]) k++; return k; })();
    if (common < Math.min(5, w.length - 1)) {
      famBad++; if (famExamples.length < 25) famExamples.push(`${w} -> ${f.word}`);
    }
  }
  // 近义可疑：候选词与词头英文相同头 4 字符（可能是同根被误当近义），或释义完全无关难判定，只统计形态相近的
  for (const f of r.synonyms) {
    if (f.word.slice(0, 4) === w.slice(0, 4) && f.word !== w && w.length >= 5) {
      synBad++; if (synExamples.length < 15) synExamples.push(`${w} -> ${f.word}(${f.gloss})`);
    }
  }
}
console.log("同根可疑数", famBad); console.log(famExamples.join("\n"));
console.log("近义形态碰撞数", synBad); console.log(synExamples.join("\n"));
core.user.close(); fs.rmSync(dir, { recursive: true, force: true });
