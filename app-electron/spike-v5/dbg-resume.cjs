const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const db = new DatabaseSync(path.resolve("data/user.sqlite"));
console.log("resume rows:", db.prepare("SELECT * FROM resume_state").all());
console.log("sessions(10):", db.prepare("SELECT id,kind,ref_id,status,amount,active_ms,started_at,last_active_at FROM learning_sessions ORDER BY id DESC LIMIT 10").all());
db.close();
