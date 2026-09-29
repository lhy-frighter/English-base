// 审计修复-3：功能词不进 unknown_encounters + 一次性清理存量污染
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}

// 1) 常量（放在 DAY_MS 前）
rep(
`const DAY_MS = 86_400_000;`,
`// 封闭类功能词/助动词：不进漏网词相遇表（the/of/and、be/do/have 助动词系列）
const AUX_WORDS = new Set(["be","is","are","was","were","been","am","being","do","does","did","done","doing",
  "have","has","had","having","will","would","shall","should","can","could","may","might","must","ought","need","dare","used"]);
const FUNCTION_POS_RE = /^\\s*(art|prep|conj|pron|det|int|interj|num|modal|aux|part|abbr)\\./i;
const DAY_MS = 86_400_000;`,
"功能词常量");

// 2) recordUnknownEncounters 过滤
rep(
`      const lem = this.canonical(low) || low;
      if (this.learned.has(low) || this.learned.has(lem)) continue;
      freq.set(lem, (freq.get(lem) || 0) + 1);`,
`      const lem = this.canonical(low) || low;
      if (this.learned.has(low) || this.learned.has(lem)) continue;
      if (this.isFunctionLemma(lem)) continue; // 功能词/助动词不进漏网词回收
      freq.set(lem, (freq.get(lem) || 0) + 1);`,
"写入过滤");

// 3) 方法 + 存量清理（插在 recordUnknownEncounters 方法之前）
rep(
`  recordUnknownEncounters(textId, tokens) {`,
`  // 功能词判定：助动词小词表 + 词典首义项为封闭词性（art/prep/conj/pron/det/num/int/modal/part）
  isFunctionLemma(lem0) {
    const lem = String(lem0 || "").toLowerCase();
    if (!lem) return false;
    if (AUX_WORDS.has(lem)) return true;
    if (this._funcYes && this._funcYes.has(lem)) return true;
    if (this._funcNo && this._funcNo.has(lem)) return false;
    const r = this.user.prepare("SELECT translation FROM dict.words WHERE word=?").get(lem);
    const first = r ? (r.translation || "").split("\\\\n")[0] : "";
    const isFunc = FUNCTION_POS_RE.test(first);
    if (isFunc) { (this._funcYes ||= new Set()).add(lem); } else { (this._funcNo ||= new Set()).add(lem); }
    return isFunc;
  }

  // 一次性清理：旧版 unknown_encounters 里的功能词行（app_settings 记录幂等）
  pruneFunctionEncounters() {
    if (this.user.prepare("SELECT 1 FROM app_settings WHERE k='func_encounters_pruned'").get()) return;
    let removed = 0;
    const lemmas = this.user.prepare("SELECT DISTINCT lemma FROM unknown_encounters").all();
    for (const { lemma } of lemmas) {
      if (this.isFunctionLemma(lemma)) {
        this.user.prepare("DELETE FROM unknown_encounters WHERE lemma=?").run(lemma);
        removed++;
      }
    }
    this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('func_encounters_pruned',?)").run(String(removed));
  }

  recordUnknownEncounters(textId, tokens) {`,
"方法与清理");

// 4) 构造函数调用
rep(
`    this.backfillUnknownEncounters();`,
`    this.backfillUnknownEncounters();
    this.pruneFunctionEncounters();`,
"构造调用");

fs.writeFileSync(fp, s, "utf8");
console.log("完成", n);
