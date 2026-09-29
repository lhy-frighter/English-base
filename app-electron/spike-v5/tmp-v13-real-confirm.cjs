const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const db = new DatabaseSync(path.join(__dirname, "..", "data", "user.sqlite"), { readOnly: true });
console.log("user_version:", db.prepare("PRAGMA user_version").get().user_version);
for (const t of ["conversation_sessions", "conversation_turns"]) {
  console.log(t, "exists:", !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t));
}
console.log("learning_sessions rows:", db.prepare("SELECT COUNT(*) n FROM learning_sessions").get().n);
console.log("read words:", db.prepare("SELECT COALESCE(SUM(amount),0) n FROM learning_sessions WHERE kind='read'").get().n);
console.log("kind check sql:", db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='learning_sessions'").get().sql.match(/CHECK\(kind[^)]*\)/)[0]);
db.close();
