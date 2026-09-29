// S10-2：App.tsx 删除本地 DashPage/Bars，改为 import ./DashPage；导航改名仪表盘
const fs = require("fs");
const fp = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}

// 1) import：加 DashPage；去掉未再使用的 Dashboard 类型
rep(
'import FeedPage from "./FeedPage";',
'import FeedPage from "./FeedPage";\nimport { DashPage } from "./DashPage";',
"import DashPage");
rep(
'type Dashboard, type SyllabusGroup',
'type SyllabusGroup',
"移除 Dashboard 类型导入");

// 2) 删除本地 Bars 组件（45 行起，到 DashPage 结束 124 行）——按函数边界切
const startMark = "function Bars({ items, color }: { items: { label: string; value: number }[]; color: string }) {";
const endMark = "function Progress({ rate, brass }: { rate: number; brass?: boolean }) {";
const i0 = s.indexOf(startMark);
const i1 = s.indexOf(endMark);
if (i0 < 0 || i1 < 0 || i1 < i0) throw new Error("Bars/DashPage 边界定位失败 " + i0 + " " + i1);
s = s.slice(0, i0) + s.slice(i1);
n++; console.log("patched: 删除本地 Bars+DashPage");

// 3) 导航文案
rep(
`          <button className={tab === "dash" ? "nav-item active" : "nav-item"} onClick={() => setTab("dash")}>
            <span>看板</span>`,
`          <button className={tab === "dash" ? "nav-item active" : "nav-item"} onClick={() => setTab("dash")}>
            <span>仪表盘</span>`,
"导航改名");

fs.writeFileSync(fp, s, "utf8");
console.log("完成", n);
