const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/v14-migration.cjs";
let t = fs.readFileSync(tp, "utf8");
const oldStr = `udb.exec("BEGIN");
try {
  MIGRATIONS[13](udb); // migrateV14
  udb.exec("PRAGMA user_version=14");
  udb.exec("COMMIT");
} catch (e) {
  udb.exec("ROLLBACK");
  throw e;
}`;
const newStr = `udb.exec("PRAGMA foreign_keys=OFF");
udb.exec("BEGIN");
try {
  MIGRATIONS[13](udb); // migrateV14
  udb.exec("PRAGMA user_version=14");
  udb.exec("COMMIT");
  udb.exec("PRAGMA foreign_keys=ON");
} catch (e) {
  udb.exec("ROLLBACK");
  try { udb.exec("PRAGMA foreign_keys=ON"); } catch { /* ignore */ }
  throw e;
}`;
if (!t.includes(oldStr)) throw new Error("anchor missing");
t = t.replace(oldStr, newStr);
fs.writeFileSync(tp, t);
console.log("part B FK handling fixed");
