const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");
const x = `      (turn_key,session_id,seq,role,status,text,committed_text,provider,model_revision,asr_engine,asr_model,edited,audio_ref,local_feedback_json,cloud_feedback_json,augment_status,interrupted_at,error_code,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,NULL,'[]','[]','pending',NULL,NULL,?)`;
const y = `      (turn_key,session_id,seq,role,status,text,committed_text,provider,model_revision,asr_engine,asr_model,edited,audio_ref,local_feedback_json,cloud_feedback_json,augment_status,interrupted_at,error_code,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,'','[]','[]','pending',NULL,NULL,?)`;
if (!s.includes(x)) { console.error("anchor missing"); process.exit(1); }
s = s.replace(x, y);
fs.writeFileSync(p, s);
console.log("audio_ref default fixed");
