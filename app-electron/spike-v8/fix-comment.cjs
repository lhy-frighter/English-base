const fs = require("fs");
const ap = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(ap, "utf8");
const bad = "\ncore 级联清理笔记/卡片/证据/来源/译文与孤儿词元；当日首启快照可回滚\n  const deleteTextCard";
const good = "\n  // v2.15.1 书库删除文章：core 级联清理笔记/卡片/证据/来源/译文与孤儿词元；当日首启快照可回滚\n  const deleteTextCard";
if (s.indexOf(bad) === -1) throw new Error("bad region not found");
s = s.replace(bad, good);
fs.writeFileSync(ap, s);
console.log("fixed");
