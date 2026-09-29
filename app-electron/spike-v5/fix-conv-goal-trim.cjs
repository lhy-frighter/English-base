const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");
const x = `    const topic = {
      goal: String(o.goal || "").slice(0, 500),`;
const y = `    const topic = {
      goal: String(o.goal || "").trim().slice(0, 500),`;
if (!s.includes(x)) { console.error("anchor missing"); process.exit(1); }
s = s.replace(x, y);
fs.writeFileSync(p, s);
console.log("goal trim fixed");
