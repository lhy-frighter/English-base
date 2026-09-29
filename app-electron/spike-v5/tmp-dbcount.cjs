const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("D:/vibe coding/英语学习/app-electron/data/user.sqlite", { readOnly: true });
for (const t of ["texts", "lexemes", "notes", "cards", "unknown_encounters", "learning_sessions", "coverage_assessments"]) {
  try { console.log(t, db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n); } catch (e) { console.log(t, "ERR", e.message); }
}
console.log("user_version:", db.prepare("PRAGMA user_version").get());
db.close();
