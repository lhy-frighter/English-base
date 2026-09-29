const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");
const x = `      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,'','[]','[]','pending',NULL,NULL,?)`;
const y = `      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,'','[]','[]','pending',NULL,'',?)`;
if (!s.includes(x)) { console.error("anchor missing"); process.exit(1); }
s = s.replace(x, y);
fs.writeFileSync(p, s);
console.log("error_code default fixed");
