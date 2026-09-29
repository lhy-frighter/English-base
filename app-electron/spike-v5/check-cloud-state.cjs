const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("D:/vibe coding/英语学习/app-electron/data/user.sqlite");
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE name='app_settings'").get().sql);
const cols = db.prepare("PRAGMA table_info(app_settings)").all();
console.log(cols.map((c) => c.name).join(","));
const rows = db.prepare("SELECT * FROM app_settings").all();
for (const r of rows) {
  if (String(r[cols[0].name]).startsWith("cloud_")) {
    const v = String(r[cols[1].name]);
    console.log(r[cols[0].name], "=", cols[0].name === "cloud_key_cipher" ? `[${v.length} chars]` : v);
  }
}
const sess = db.prepare("SELECT id,status,turns_count,brain_engine,brain_model_revision FROM conversation_sessions ORDER BY id DESC LIMIT 3").all();
console.log(JSON.stringify(sess, null, 1));
