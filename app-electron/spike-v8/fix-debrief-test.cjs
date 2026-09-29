const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/debrief.cjs";
let s = fs.readFileSync(tp, "utf8");

const oldIns = `const sessKey = "sess-x";
db.prepare(\`INSERT INTO conversation_sessions
  (session_key,topic,cefr,started_at,active_ms,status) VALUES(?,?,?,?,?,?)
\`)
  .run(sessKey, "Travel", "B1", Date.now(), 0, "closed");
db.prepare(\`INSERT INTO conversation_turns
  (session_key,turn_key,role,text,status,committed_text,created_at)
  VALUES(?,?,?,?,?,?,?)
\`)
  .run(sessKey, "u1", "user", "I look forward to it", "completed", "I look forward to it", Date.now());`;

const newIns = `const sessKey = "sess-x";
const nowTs = Date.now();
db.prepare(\`INSERT INTO conversation_sessions
  (session_key,title,topic_json,started_at,last_active_at,status,active_ms,cefr_at_start,turns_count)
  VALUES(?,?,?,?,?,?,?,?,?)
\`)
  .run(sessKey, "Travel", "{}", nowTs, nowTs, "closed", 0, "B1", 1);
const sessId = db.prepare("SELECT id FROM conversation_sessions WHERE session_key=?").get(sessKey).id;
db.prepare(\`INSERT INTO conversation_turns
  (session_id,seq,turn_key,role,text,status,committed_text,created_at)
  VALUES(?,?,?,?,?,?,?,?)
\`)
  .run(sessId, 0, "u1", "user", "I look forward to it", "completed", "I look forward to it", nowTs);`;

if (s.indexOf(oldIns) === -1) throw new Error("insert anchor missing");
s = s.replace(oldIns, newIns);
fs.writeFileSync(tp, s);
console.log("test fixed");
