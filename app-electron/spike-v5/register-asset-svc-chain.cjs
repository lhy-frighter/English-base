const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/package.json";
let s = fs.readFileSync(p, "utf8");
const anchor = "node test/v14-migration.cjs";
if (!s.includes(anchor)) throw new Error("anchor missing");
s = s.replace(anchor, anchor + " && node test/asset-service.cjs");
fs.writeFileSync(p, s);
console.log("asset-service chain registered");
