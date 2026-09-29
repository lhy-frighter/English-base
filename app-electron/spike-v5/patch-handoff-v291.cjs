const fs = require("fs");
const fp = "D:\\vibe coding\\英语学习\\交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const anchor = "> 更新：2026-09-23 · 版本 v2.29.0（**精读词数口径修复**）";
if (!s.includes(anchor)) throw new Error("anchor missing");
if (s.includes("v2.29.1")) { console.log("already"); process.exit(0); }
const block = `> 更新：2026-09-23 · 版本 v2.29.1（**阅读器顶栏冻结**）
> - 用户反馈：阅读器第一行（←书库 / 词数与旧词重现统计 / 颜色图例 / 对照译文开关）随正文滚走，退出和开关译文要滚回顶部，体验差。
> - 该 page-head 增加类 \`reader-head\`：\`position:sticky; top:0; z-index:30\`，负边距铺满 .main 宽度（margin -28px -36px、内边距与正文对齐），带背景与下边框；正文滚动时顶栏始终可见，换行可自动折行。
> - 纯样式改动，不动数据与交互。tsc=0；vite build=0；冒烟通过。
> - 真机闸门：进入阅读器向下滚动，确认顶栏（退出、统计、译文开关）一直固定在顶部且不遮挡正文。

`;
s = s.replace(anchor, block + anchor);
fs.writeFileSync(fp, s, "utf8");
console.log("handoff v2.29.1 inserted");
