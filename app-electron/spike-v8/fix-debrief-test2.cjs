const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/debrief.cjs";
let s = fs.readFileSync(tp, "utf8");
const start = 'const sessKey = "sess-x";';
const i = s.indexOf(start);
if (i === -1) throw new Error("start missing");
const endLineMarker = '.run(sessKey, "u1", "user", "I look forward to it", "completed", "I look forward to it", Date.now());';
const j = s.indexOf(endLineMarker, i);
if (j === -1) throw new Error("end missing");
const good =
`const sessKey = "sess-x";
const nowTs = Date.now();
db.prepare(\`INSERT INTO conversation_sessions
  (session_key,title,topic_json,started_at,last_active_at,status,active_ms,cefr_at_start,turns_count)
  VALUES(?,?,?,?,?,?,?,?,?)\`)
  .run(sessKey, "Travel", "{}", nowTs, nowTs, "closed", 0, "B1", 1);
const sessId = db.prepare("SELECT id FROM conversation_sessions WHERE session_key=?").get(sessKey).id;
db.prepare(\`INSERT INTO conversation_turns
  (session_id,seq,turn_key,role,text,status,committed_text,created_at)
  VALUES(?,?,?,?,?,?,?,?)\`)
  .run(sessId, 0, "u1", "user", "I look forward to it", "completed", "I look forward to it", nowTs);`;
s = s.slice(0, i) + good + s.slice(j + endLineMarker.length);
fs.writeFileSync(tp, s);
console.log("fixed");
