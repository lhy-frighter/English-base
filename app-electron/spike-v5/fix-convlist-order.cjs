const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");
const x = `    return this.user.prepare("SELECT * FROM conversation_sessions ORDER BY started_at DESC LIMIT ?")`;
const y = `    return this.user.prepare("SELECT * FROM conversation_sessions ORDER BY started_at DESC, id DESC LIMIT ?")`;
if (!s.includes(x)) { console.error("anchor missing"); process.exit(1); }
s = s.replace(x, y);
fs.writeFileSync(p, s);
console.log("convList tie-break added");
