// 交接 v2.18.0 补记：S9-2 真机闸门通过后的三处排障修复
const fs = require("fs");
const path = require("path");
const doc = path.resolve(__dirname, "..", "..", "交接文档.md");
let s = fs.readFileSync(doc, "utf8");
const oldStr = "> - **App.tsx**：`.reader` 挂 readerRef；滚动停止后最多 5s 落一次（位置未变不写），页面隐藏/beforeunload/切文章/回书库时立即补落；打开旧文章 220ms 后按锚点段落 `scrollIntoView` 归位并提示「已恢复到上次阅读位置（第 N 段）」；机翻到达导致版面下移后按同段重新归位一次；哈希对不上（文章被替换）回开头并提示「原文已变化」；词卡跳转原文（jumpWord）优先于断点恢复。";
const newStr = "> - **App.tsx**：`.reader` 挂 readerRef；滚动监听挂在**真正的滚动容器 `.main`**（flex+overflow-y:auto；window 不滚动，首版误挂 window 导致从不触发）；滚动时按文章缓存锚点（anchorMapRef，防切文章 cleanup 在新 DOM 上算锚点的竞态），停止后最多 5s 落一次，页面隐藏/beforeunload/切文章/回书库时用缓存立即补落；打开旧文章 220ms 后**显式设置 `.main` scrollTop** 归位（scrollIntoView 在 body overflow:hidden 的嵌套容器下实测失效），600ms 后二次校准（字体/译文版面位移），并提示「已恢复到上次阅读位置（第 N 段）」；机翻到达后按同段重新归位一次；哈希对不上（文章被替换）回开头并提示「原文已变化」；词卡跳转原文（jumpWord）优先于断点恢复。";
if (!s.includes(oldStr)) throw new Error("锚点缺失");
s = s.replace(oldStr, newStr);
const oldGate = "> - **待用户真机闸门（杀进程）**：打开一篇长文滚到中段 → 等 ≥5s（或切走标签页触发立即落库）→ 任务管理器直接结束进程 → 重开应用、从书库打开同一篇 → 应自动回到该段并出现恢复提示；再测从词卡点词跳转原文时不被断点覆盖。";
const newGate = "> - **真机闸门已通过（2026-09-21）**：杀进程重开后正确回到第 56 段并出现恢复提示。排障三轮：①监听改挂 `.main`；②anchorMapRef 修切文章竞态；③显式 scrollTop+二次校准替代 scrollIntoView。诊断 console 打点封板时已移除。";
if (!s.includes(oldGate)) throw new Error("闸门锚点缺失");
s = s.replace(oldGate, newGate);
fs.writeFileSync(doc, s, "utf8");
console.log("done");
