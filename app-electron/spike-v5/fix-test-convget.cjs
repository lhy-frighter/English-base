const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/test/conv-session.cjs";
let s = fs.readFileSync(p, "utf8");
const old = `const after = core.convGet({ sessionKey: recSess.sessionKey });`;
const next = `const after = core.convGet(recSess.sessionKey);`;
if (!s.includes(old)) throw new Error("convGet call anchor missing");
s = s.replace(old, next);
fs.writeFileSync(p, s);
console.log("convGet call fixed");
