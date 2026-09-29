const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/realtime-relay.cjs";
let s = fs.readFileSync(p, "utf8");
const find = '      if (k === "audio" || k === "delta") { out[k] = "<redacted:" + sizeOf(v) + ">"; continue; }';
if (s.indexOf(find) < 0) throw new Error("anchor not found");
s = s.replace(find, '      if (k === "audio") { out[k] = "<redacted:" + sizeOf(v) + ">"; continue; }');
fs.writeFileSync(p, s);
console.log("redact patched");
