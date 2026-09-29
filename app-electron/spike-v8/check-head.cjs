const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
const buf = fs.readFileSync(p);
console.log("first 80 bytes:", JSON.stringify(buf.slice(0, 80).toString("latin1")));
