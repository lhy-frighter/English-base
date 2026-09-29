const fs = require("fs");
const fp = "D:\\vibe coding\\英语学习\\交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const anchor = "> 更新：2026-09-23 · 版本 v2.29.1（**阅读器顶栏冻结**）";
if (!s.includes(anchor)) throw new Error("anchor missing");
if (s.includes("v2.29.2")) { console.log("already"); process.exit(0); }
const block = `> 更新：2026-09-23 · 版本 v2.29.2（**能力测评入口修复**）
> - 用户反馈：仪表盘（及今日页）点「开始能力测评」无反应。根因：AssessPage 作为同级节点渲染在当前页之后，视图停在原滚动位置，测评页在下方/底部不可见。
> - 修复：assessView 打开时隐藏今日页/仪表盘（tab 条件加 !assessView），并把 .main 滚动位置重置到顶部；两个入口（今日 tcard、仪表盘按钮）均生效。
> - tsc=0；vite build=0；冒烟通过。真机闸门：点「开始能力测评」立即进入测评选择页，可选 B2/C1 并开始。

`;
s = s.replace(anchor, block + anchor);
fs.writeFileSync(fp, s, "utf8");
console.log("handoff v2.29.2 inserted");
