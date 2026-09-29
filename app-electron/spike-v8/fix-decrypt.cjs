const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/spike-v8/probe-realtime.cjs";
let s = fs.readFileSync(p, "utf8");
const old = `  return safeStorage.decryptString(row.v);`;
const neu = `  return safeStorage.decryptString(Buffer.from(row.v, "base64"));`;
if (s.indexOf(old) === -1) { console.log("ANCHOR MISSING"); process.exit(2); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log("decrypt buffer fixed");
