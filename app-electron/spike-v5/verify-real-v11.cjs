const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const db = new DatabaseSync(path.resolve(__dirname, "..", "data", "user.sqlite"));
console.log("user_version =", db.prepare("PRAGMA user_version").get().user_version);
for (const t of ["app_settings", "learning_sessions", "resume_state", "unknown_encounters", "coverage_assessments"]) {
  const r = db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name=?").get(t);
  console.log(t, r.n ? "OK" : "MISSING");
}
console.log("texts =", db.prepare("SELECT COUNT(*) n FROM texts").get().n);
console.log("lexemes =", db.prepare("SELECT COUNT(*) n FROM lexemes").get().n);
console.log("attempts.active_ms cols =", db.prepare("PRAGMA table_info(attempts)").all().map((c) => c.name).filter((c) => c === "active_ms").length);
db.close();
