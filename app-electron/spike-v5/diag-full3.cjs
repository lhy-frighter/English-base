// 二刷审计 C：canonical 回退复测 + meaningChoices 正确用法大样本 + 家族垃圾复扫
const { Core } = require("../core.cjs");
const { DatabaseSync } = require("node:sqlite");
const path = require("path"), fs = require("fs"), os = require("os");

const dict = new DatabaseSync(path.join(__dirname, "..", "data", "dict.sqlite"));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "diag3-"));
const core = new Core(dir);

// A. canonical：所有带 0:base 标记的词头抽样（前 3000 个 frq 最高的）
const heads = dict.prepare(
  `SELECT word, exchange, frq FROM words WHERE exchange LIKE '%0:%' ORDER BY frq DESC LIMIT 3000`
).all();
let badCanon = [];
for (const h of heads) {
  const m0 = h.exchange.match(/(?:^|\/)0:([^/]+)/);
  if (!m0) continue;
  const base = m0[1].toLowerCase();
  if (base === h.word.toLowerCase()) continue;
  const got = core.canonical(h.word.toLowerCase());
  const baseExists = !!dict.prepare("SELECT 1 FROM words WHERE word=?").get(base);
  if (baseExists && got !== base && got !== h.word.toLowerCase()) {
    badCanon.push(`${h.word}->${got} (期望 ${base})`);
  } else if (baseExists && got === h.word.toLowerCase()) {
    // 高频表层保持自身可能合理（interesting）；只报零频表层未还原
    if (!(Number(h.frq) > 0)) badCanon.push(`${h.word}(frq0) 未还原到 ${base}，got=${got}`);
  }
}
console.log(`A canonical 异常: ${badCanon.length}`);
console.log(badCanon.slice(0, 40).map((x) => "   " + x).join("\n"));

// B. meaningChoices 正确用法：(中译文, lemma)，返回乱序字符串数组
const words = dict.prepare(
  `SELECT word, translation, frq FROM words WHERE translation<>'' AND frq>0 ORDER BY RANDOM() LIMIT 600`
).all();
let throws = [], badLen = [], dup = [], leak = [], missing = [];
for (const r of words) {
  const gloss = r.translation.split("\\n")[0].trim();
  if (!/[一-鿿]/.test(gloss)) continue;
  let ch;
  try { ch = core.meaningChoices(gloss, r.word.toLowerCase()); }
  catch (e) { throws.push(`${r.word}: ${e.message}`); continue; }
  if (ch.length !== 4) { badLen.push(`${r.word}: ${ch.length}`); continue; }
  if (new Set(ch).size !== 4) { dup.push(r.word); continue; }
  if (!ch.includes(gloss)) { missing.push(r.word); continue; }
  const head = (gloss.match(/[一-鿿]{2,6}/) || [])[0];
  if (head) {
    for (const g of ch) {
      if (g === gloss) continue;
      if (g.includes(head)) { leak.push(`${r.word}: ${g} ~ ${gloss}`); break; }
    }
  }
}
console.log(`B choices: throws=${throws.length} badLen=${badLen.length} dup=${dup.length} missing=${missing.length} leak=${leak.length}`);
console.log(throws.slice(0, 8).map((x) => "   THROW " + x).join("\n"));
console.log(badLen.slice(0, 8).map((x) => "   LEN " + x).join("\n"));
console.log(leak.slice(0, 12).map((x) => "   LEAK " + x).join("\n"));

// C. 家族垃圾复扫 top1500：零频+无 tag+无 0: 自声明的成员
const top = dict.prepare(`SELECT word FROM words WHERE frq>0 ORDER BY frq LIMIT 1500`).all();
let junk = [];
for (const { word } of top) {
  const low = word.toLowerCase();
  let fam;
  try { fam = core.relatedWords(low).family; } catch { continue; }
  for (const f of fam) {
    const rr = dict.prepare("SELECT frq,tag,exchange FROM words WHERE word=?").get(f.word);
    if (!rr) continue;
    if (Number(rr.frq) > 0 || rr.tag) continue;
    const m0 = (rr.exchange || "").match(/(?:^|\/)0:([^/]+)/);
    if (m0 && m0[1].toLowerCase() === low) continue; // 合法零频屈折
    if (f.word.includes("-")) continue;
    junk.push(`${low} -> ${f.word}`);
  }
}
console.log(`C 家族零频垃圾: ${junk.length}`);
console.log(junk.slice(0, 40).map((x) => "   " + x).join("\n"));

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
dict.close();
