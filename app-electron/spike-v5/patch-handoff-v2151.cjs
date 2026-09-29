// v2.15.1 交接文档小补丁（幂等）
const fs = require("fs");
const path = require("path");
const doc = path.resolve(__dirname, "..", "..", "交接文档.md");
let s = fs.readFileSync(doc, "utf8");
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("未找到锚点: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}
rep("> 更新：2026-09-21 · 版本 v2.15.0（",
    "> 更新：2026-09-21 · 版本 v2.15.1（v2.15.1 书库卡片右上角悬停「×」删除入口接线：core.deleteText → main IPC textDelete → preload → api.textDelete → 卡片 div role=button + 确认弹窗，删除后刷新书库与计数；v2.15.0 ",
    "头部版本");
rep("书库支持删除文章（级联清理笔记/卡片/证据/查词日志与孤儿词元，删前自动快照）",
    "书库支持删除文章（v2.15.1 起卡片右上角悬停「×」入口；级联清理笔记/卡片/证据/查词日志/来源/译文与孤儿词元，当日首启快照可回滚）",
    "§5 删除描述");
fs.writeFileSync(doc, s, "utf8");
console.log("done", n);
