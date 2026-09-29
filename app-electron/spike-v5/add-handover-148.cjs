const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = "话题切换清空面板。";
if (s.indexOf(anchor) < 0) throw new Error("anchor missing");
const add = "\r\n> - **#148 「转为练习」自动填释义**：点气泡「转为练习」即自动获取中文释义（TEACH zh → Bergamot 本地翻译（租约内）→ 云端 quickTranslate 非流式快译），sheet 释义框显示「AI 分析中…」并自动回填，无需手填；全部失败则留空、不阻塞确认。";
s = s.replace(anchor, anchor + add);
fs.writeFileSync(p, s);
console.log("handover #148 added");
