const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("D:/vibe coding/英语学习/app-electron/data/user.sqlite");
console.log("user_version:", db.prepare("PRAGMA user_version").get().user_version);
console.log("integrity:", db.prepare("PRAGMA integrity_check").get().integrity_check);
console.log("fk issues:", db.prepare("PRAGMA foreign_key_check").all().length);
for (const t of ["lexemes","notes","cards","review_log","learning_assets","asset_encounters","asset_evidence","debrief_drafts","shadow_sentences","texts","papers","wrong_questions","conversation_sessions","conversation_turns"]) {
  try { console.log(t, db.prepare("SELECT COUNT(*) n FROM " + t).get().n); }
  catch (e) { console.log(t, "MISSING:", e.message); }
}
db.close();
