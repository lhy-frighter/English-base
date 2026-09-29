// 交接文档升 v2.22.0（S11-a 复习卡一键回语境）
const fs = require("fs");
const fp = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const NL = "\r\n";
const entry = [
"> 更新：2026-09-22 · 版本 v2.22.0（**S11-a 复习卡一键回语境：复习卡背面例句下可跳回原文，段定位+词形屈折匹配闪烁**）",
"> - **core**：`getDue()` 卡负载新增 `text_id`（notes.text_id，阅读/跟读卡为文章 id，考纲独立卡与错题概念卡为 null）。",
"> - **前端 App.tsx**：①复习卡背面「例句」下，text_id 非空时出现「↗ 回看原文语境」按钮，点击 `jumpToText(textId, word, full)` 跳到阅读页（复习队列与评分状态保留在 App state，回来继续）；②回语境定位升级——旧 jumpWord 只在全文做精确词匹配且用 scrollIntoView（S9-2 已证在嵌套 .main 容器不驱动滚动），新 jumpCtx={word,sentence}：先用例句前 40 字符（空白归一）定位所在段落 `p[data-pi]`，用 scrollToPara 显式滚 .main，再在段内匹配词元，**支持屈折形态**（investigated/studies 等，前缀 max(4,len-3)、长度差 ≤4），命中全部加 jump-flash 闪烁 2.4s；找不到段则全文找词；③词库详情页原「跳转文章」入口同步传例句，走同一条定位链路；effect 移到 scrollToPara 声明之后（TS2448）。",
"> - **样式**：`.context-jump` 小按钮（styles.css 末尾）。",
"> - **验证**：新增 `test/s11-context-jump.cjs` **5 断言**（阅读卡带 text_id 与原句、独立卡 text_id=null、字段全覆盖）；**33 链 npm test 全绿**、tsc=0、vite build=0（index js 350.96kB/gzip 111.57kB）、隐藏冒烟通过。",
"> - **待用户目视闸门**：复习一张阅读卡（如 investigate），背面点「回看原文语境」→ 跳到文章并滚到例句段、词闪烁；考纲卡背面不出现该按钮；从词库详情点文章跳转也应落在例句段。",
""
].join(NL);
if (s.includes("v2.22.0")) { console.log("skip"); }
else {
  const head = "# 个人英语能力底座 · 交接文档" + NL;
  if (!s.startsWith(head)) throw new Error("头部锚点缺失");
  s = head + NL + entry + s.slice(head.length);
  fs.writeFileSync(fp, s, "utf8");
  console.log("patched v2.22.0");
}
