// 审计修复-5：相遇表长度门控；合并后二次功能词清理（v2 一次性）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

// 1) 写入时长度门控
rep(
`      if (this.isFunctionLemma(lem)) continue; // 功能词/助动词不进漏网词回收
      freq.set(lem, (freq.get(lem) || 0) + 1);`,
`      if (lem.length < 3) continue; // 单字母（PDF 数学变量 k/x 等）不进漏网词
      if (this.isFunctionLemma(lem)) continue; // 功能词/助动词不进漏网词回收
      freq.set(lem, (freq.get(lem) || 0) + 1);`,
"长度门控");

// 2) prune 同时清理长度<3
rep(
`    for (const { lemma } of lemmas) {
      if (this.isFunctionLemma(lemma)) {
        this.user.prepare("DELETE FROM unknown_encounters WHERE lemma=?").run(lemma);
        removed++;
      }
    }`,
`    for (const { lemma } of lemmas) {
      if (lemma.length < 3 || this.isFunctionLemma(lemma)) {
        this.user.prepare("DELETE FROM unknown_encounters WHERE lemma=?").run(lemma);
        removed++;
      }
    }`,
"prune 长度");

// 3) 合并时跳过功能词/过短目标（避免 has→have 合并后复活）
rep(
`    for (const r of rows) {
      const lem = this.canonical(r.lemma) || r.lemma;
      const key = lem + "|" + r.text_id;`,
`    for (const r of rows) {
      const lem = this.canonical(r.lemma) || r.lemma;
      if (lem.length < 3 || this.isFunctionLemma(lem)) continue;
      const key = lem + "|" + r.text_id;`,
"合并跳过功能词-收集");

rep(
`    for (const r of rows) {
      const lem = this.canonical(r.lemma) || r.lemma;
      if (lem !== r.lemma) this.user.prepare("DELETE FROM unknown_encounters WHERE lemma=? AND text_id=?").run(r.lemma, r.text_id);
    }
    this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('encounters_consolidated_v1',?)").run(String(changed));`,
`    for (const r of rows) {
      const lem = this.canonical(r.lemma) || r.lemma;
      if (lem !== r.lemma || lem.length < 3 || this.isFunctionLemma(lem)) {
        this.user.prepare("DELETE FROM unknown_encounters WHERE lemma=? AND text_id=?").run(r.lemma, r.text_id);
      }
    }
    this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('encounters_consolidated_v1',?)").run(String(changed));
  }

  // v2 一次性：v1 合并后助动词（has/had→have）与单字母复活的二次清理
  cleanupEncountersV2() {
    if (this.user.prepare("SELECT 1 FROM app_settings WHERE k='encounters_cleanup_v2'").get()) return;
    let removed = 0;
    const lemmas = this.user.prepare("SELECT DISTINCT lemma FROM unknown_encounters").all();
    for (const { lemma } of lemmas) {
      if (lemma.length < 3 || this.isFunctionLemma(lemma)) {
        this.user.prepare("DELETE FROM unknown_encounters WHERE lemma=?").run(lemma);
        removed++;
      }
    }
    this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('encounters_cleanup_v2',?)").run(String(removed));`,
"v2 清理");

// 4) 构造函数注册
rep(
`    this.pruneFunctionEncounters();
    this.consolidateEncounterLemmas();`,
`    this.pruneFunctionEncounters();
    this.consolidateEncounterLemmas();
    this.cleanupEncountersV2();`,
"构造注册");

fs.writeFileSync(fp, s, "utf8");
console.log("done");
