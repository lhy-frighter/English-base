const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const bad = ">\r\n>> 更新：2026-09-24 · 版本 v2.38.0";
const good = ">\r\n>\r\n> 更新：2026-09-24 · 版本 v2.38.0";
if (!s.includes(bad)) throw new Error("bad pattern not found");
fs.writeFileSync(p, s.replace(bad, good));
console.log("fixed");
