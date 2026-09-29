const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/package.json";
let s = fs.readFileSync(p, "utf8");
const old = `node test/conv-session.cjs && node --experimental-strip-types test/conv-context.ts && node test/s9-session.cjs`;
const next = `node test/conv-session.cjs && node --experimental-strip-types test/conv-context.ts && node test/cloud-settings.cjs && node test/s9-session.cjs`;
if (!s.includes(old)) throw new Error("test chain anchor missing");
s = s.replace(old, next);
fs.writeFileSync(p, s);
console.log("cloud-settings added to test chain");
