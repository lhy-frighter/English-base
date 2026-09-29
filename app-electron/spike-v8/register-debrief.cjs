const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/package.json";
let s = fs.readFileSync(p, "utf8");
if (s.indexOf("test/debrief.cjs") !== -1) { console.log("already"); process.exit(0); }
const anchor = "&& node test/asset-service.cjs &&";
if (s.indexOf(anchor) === -1) throw new Error("anchor missing");
s = s.replace(anchor, "&& node test/asset-service.cjs && node test/debrief.cjs &&");
fs.writeFileSync(p, s);
console.log("registered");
