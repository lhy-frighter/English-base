const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("D:/vibe coding/英语学习/app-electron/data/user.sqlite");
const rows = db.prepare(
  "SELECT s.title,t.role,t.status,substr(t.text,0,100) AS text,substr(t.committed_text,0,100) AS ct,t.played_char_end AS pe,t.error_code AS ec,t.created_at FROM conversation_turns t JOIN conversation_sessions s ON s.id=t.session_id ORDER BY t.id DESC LIMIT 8",
).all();
console.log(JSON.stringify(rows, null, 1));
const sess = db.prepare(
  "SELECT id,title,status,turns_count,last_active_at FROM conversation_sessions ORDER BY id DESC LIMIT 3",
).all();
console.log(JSON.stringify(sess, null, 1));
