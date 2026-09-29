const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/package.json";
let s = fs.readFileSync(p, "utf8");
const x = `node test/v13-conversation.cjs && node test/s9-session.cjs`;
const y = `node test/v13-conversation.cjs && node test/conv-session.cjs && node test/s9-session.cjs`;
if (!s.includes(x)) { console.error("anchor missing"); process.exit(1); }
s = s.replace(x, y);
fs.writeFileSync(p, s);
console.log("conv-session added to npm test chain");
