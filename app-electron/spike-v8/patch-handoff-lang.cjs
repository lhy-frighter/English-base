const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let doc = fs.readFileSync(p, "utf8");
const EOL = "\r\n";
const line = "> - **追加修正（同日）**：上一版中文规则过强导致纯英文消息也被中文回复；语言触发改为严格按消息中是否真有汉字——无汉字必须全英文回复，中文解释/语法中文讲解仅在消息含汉字时启用。tsc=0、vite build=0。";
const lines = doc.split(EOL);
lines.splice(2, 0, line);
fs.writeFileSync(p, lines.join(EOL));
console.log("handoff line added");
