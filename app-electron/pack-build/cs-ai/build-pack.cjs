// build-pack.cjs — 由 words.txt / mwe.txt / lemma.txt 构建 data/packs/cs-ai.sqlite
// 纯字符串数据，无网络依赖；重复执行结果幂等（先写 staging 再原子改名）。
// 运行：node pack-build/cs-ai/build-pack.cjs
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

const SRC = __dirname;
const OUT_DIR = path.join(__dirname, "..", "..", "data", "packs");
const OUT = path.join(OUT_DIR, "cs-ai.sqlite");
const STAGE = OUT + ".stage";

function readLines(file) {
  return fs.readFileSync(path.join(SRC, file), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

const words = [];
const seenW = new Set();
for (const line of readLines("words.txt")) {
  const [word, pos, ...rest] = line.split("|");
  const translation = rest.join("|").trim();
  const w = (word || "").trim().toLowerCase();
  if (!w || !translation) { console.warn("跳过坏行:", line); continue; }
  if (seenW.has(w)) { console.warn("重复词头，跳过:", w); continue; }
  seenW.add(w);
  words.push({ word: w, pos: (pos || "").trim(), translation });
}

const mwes = [];
const seenM = new Set();
for (const line of readLines("mwe.txt")) {
  const [phrase, pos, ...rest] = line.split("|");
  const translation = rest.join("|").trim();
  const p = (phrase || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!p || !translation) { console.warn("跳过坏行:", line); continue; }
  if (seenM.has(p)) { console.warn("重复短语，跳过:", p); continue; }
  seenM.add(p);
  mwes.push({ phrase: p, pos: (pos || "").trim(), translation });
}

// 先建 staging（含 L0 词典用于校验 lemma 指向）
fs.mkdirSync(OUT_DIR, { recursive: true });
try { fs.rmSync(STAGE); } catch { /* 无残留 */ }
const db = new DatabaseSync(STAGE);
db.exec(`
CREATE TABLE words(word TEXT PRIMARY KEY, phonetic TEXT, pos TEXT, translation TEXT, definition TEXT, tag TEXT, bnc INTEGER, frq INTEGER);
CREATE TABLE mwe(phrase TEXT PRIMARY KEY, translation TEXT, pos TEXT, tag TEXT);
CREATE TABLE lemma(flexion TEXT PRIMARY KEY, lemma TEXT);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
`);
// 挂 L0 仅用于校验 lemma 与统计补充义项
const dictPath = path.join(OUT_DIR, "..", "dict.sqlite");
db.exec(`ATTACH DATABASE '${dictPath.replace(/'/g, "''")}' AS dict`);
const dictW = (w) => db.prepare("SELECT translation FROM dict.words WHERE word=?").get(w);
const dictM = (p) => db.prepare("SELECT 1 x FROM dict.mwe WHERE phrase=?").get(p);

// 中文实义词片段（去 [AI]/[计] 标签与英文括注后），用于判断 L0 释义是否已覆盖包释义
const cjkRuns = (s) => (s.replace(/\[[A-Z/]+\]/g, "").match(/[一-鿿]{2,}/g) || []);
function alreadyCovered(packZh, dictZh) {
  const runs = cjkRuns(packZh).filter((r) => r.length >= 3);
  return runs.some((r) => dictZh.includes(r));
}

const insW = db.prepare("INSERT INTO words(word,phonetic,pos,translation,definition,tag,bnc,frq) VALUES(?,?,?,?,?,'cs-ai',0,0)");
let supplement = 0, skippedDup = 0;
const dupSkipped = [];
for (const w of words) {
  const d = dictW(w.word);
  if (d && alreadyCovered(w.translation, d.translation || "")) { skippedDup++; dupSkipped.push(w.word); continue; }
  insW.run(w.word, "", w.pos, w.translation, "");
  if (d) supplement++;
}
const insM = db.prepare("INSERT INTO mwe(phrase,translation,pos,tag) VALUES(?,?,?,'cs-ai')");
let mweSupplement = 0, mweSkipped = 0;
for (const m of mwes) {
  if (dictM(m.phrase)) { mweSkipped++; continue; }
  insM.run(m.phrase, m.translation, m.pos);
}
const insL = db.prepare("INSERT INTO lemma VALUES(?,?)");
let lemmaKept = 0, lemmaDrop = 0;
const packWords = new Set(db.prepare("SELECT word FROM words").all().map((r) => r.word));
for (const line of readLines("lemma.txt")) {
  const [flexion, lemma] = line.split("|").map((s) => (s || "").trim().toLowerCase());
  if (!flexion || !lemma) continue;
  if (!packWords.has(lemma) && !dictW(lemma)) { console.warn(`lemma 指向不存在，丢弃: ${flexion}→${lemma}`); lemmaDrop++; continue; }
  insL.run(flexion, lemma);
  lemmaKept++;
}

const meta = {
  id: "cs-ai",
  name: "CS/AI 术语包",
  version: "0.1.0",
  license: "CC-BY-SA-4.0（人工整理；术语释义参考 Wiktionary CC-BY-SA 与 Google ML Glossary CC-BY）",
  source: "pack-build/cs-ai 人工 seed（words/mwe/lemma.txt）",
  built_at: new Date().toISOString(),
};
const insMeta = db.prepare("INSERT INTO meta VALUES(?,?)");
for (const [k, v] of Object.entries(meta)) insMeta.run(k, v);

db.exec("DETACH DATABASE dict");
db.close();
fs.renameSync(STAGE, OUT);
console.log(`已生成 ${path.relative(process.cwd(), OUT)}`);
console.log(`words=${words.length - skippedDup}（新增 ${words.length - skippedDup - supplement}，补充义项 ${supplement}；L0 已覆盖跳过 ${skippedDup}）`);
console.log(`mwe=${mwes.length - mweSkipped}（L0 已有跳过 ${mweSkipped}）`);
console.log(`lemma=${lemmaKept}（丢弃 ${lemmaDrop} 个无效指向）`);
if (dupSkipped.length) console.log("跳过的重复词头:", dupSkipped.join(", "));
