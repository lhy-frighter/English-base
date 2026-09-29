const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/package.json";
let s = fs.readFileSync(p, "utf8");
const anchor = " && node test/ipc-contract.cjs\"";
if (s.indexOf(anchor) < 0) throw new Error("test anchor not found");
if (s.includes("node test/realtime-relay.cjs")) { console.log("already present"); process.exit(0); }
s = s.replace(anchor, " && node test/realtime-relay.cjs" + anchor);
fs.writeFileSync(p, s);
console.log("package.json test chain appended");
