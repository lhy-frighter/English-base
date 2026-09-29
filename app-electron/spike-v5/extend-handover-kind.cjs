const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = "全部失败则留空、不阻塞确认。";
if (s.indexOf(anchor) < 0) throw new Error("anchor missing");
const add = [
  "\r\n>   - 手动切「语法」时「正确答案」自动填为原句（空时）；",
  "\r\n>   - 手动切「发音」时新增 core.phoneticsFor 批量取词音标（不记 lookup 日志，dict→lemmaOf→ruleLemma 回退）+ IPC phonetics（main/preload/api），IPA 框逐词拼成 /音标/ 串，显示「AI 取音标中…」，全 miss 留空。",
].join("");
s = s.replace(anchor, anchor + add);
fs.writeFileSync(p, s);
console.log("handover extended");
