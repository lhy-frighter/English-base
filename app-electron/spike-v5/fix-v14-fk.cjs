const fs = require("fs");

// --- core.cjs: migrate() 包裹 foreign_keys OFF/ON（表重建标准流程）---
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let c = fs.readFileSync(cp, "utf8");
function repC(oldStr, newStr, label) {
  if (!c.includes(oldStr)) throw new Error("CORE NOT FOUND: " + label);
  c = c.replace(oldStr, newStr);
}
repC(
  `        this.user.exec("BEGIN");
        try {
          const step = MIGRATIONS[i];`,
  `        this.user.exec("PRAGMA foreign_keys=OFF"); // 表重建标准流程：须在事务外切换
        this.user.exec("BEGIN");
        try {
          const step = MIGRATIONS[i];`,
  "fk off"
);
repC(
  `          this.user.exec("COMMIT");
        } catch (e) {
          try { this.user.exec("ROLLBACK"); } catch { /* ignore */ }`,
  `          this.user.exec("COMMIT");
          this.user.exec("PRAGMA foreign_keys=ON");
        } catch (e) {
          try { this.user.exec("ROLLBACK"); } catch { /* ignore */ }
          try { this.user.exec("PRAGMA foreign_keys=ON"); } catch { /* ignore */ }`,
  "fk on"
);
fs.writeFileSync(cp, c);

// --- test: 用真实 note id 做 XOR 正向用例 ---
const tp = "D:/vibe coding/英语学习/app-electron/test/v14-migration.cjs";
let t = fs.readFileSync(tp, "utf8");
function repT(oldStr, newStr, label) {
  if (!t.includes(oldStr)) throw new Error("TEST NOT FOUND: " + label);
  t = t.replace(oldStr, newStr);
}
repT(
  `rejects("cards 双 NULL 被拒", () => insCard(null, null));
rejects("cards 双非空被拒", () => insCard(1, 1));
check("cards note 归属可写", insCard(1, null) === 1);
check("cards asset 归属可写", insCard(null, chkId) === 1);`,
  `const noteId = db.prepare("INSERT INTO notes(lexeme_id,context_sentence,created_at,source) VALUES(?,?,?,'reading')")
  .run(lexId, "a real note sentence", now).lastInsertRowid;
rejects("cards 双 NULL 被拒", () => insCard(null, null));
rejects("cards 双非空被拒", () => insCard(noteId, chkId));
check("cards note 归属可写", insCard(noteId, null) === 1);
check("cards asset 归属可写", insCard(null, chkId) === 1);`,
  "xor positives"
);
fs.writeFileSync(tp, t);
console.log("FK rebuild handling applied");
