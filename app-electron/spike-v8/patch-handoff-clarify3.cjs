const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = "# 个人英语能力底座 · 交接文档\r\n";
if (s.indexOf(anchor) === -1) throw new Error("anchor not found");
if (s.indexOf("补丁 v3：澄清后中文作答") !== -1) {
  console.log("already patched");
  process.exit(0);
}
const block = [
  "> 更新：2026-09-25 · **#151 补丁 v3：澄清后中文作答 → 教学一键入库**（真机需求：中文澄清后用中文说意图/卡词，系统要给自然英文并一键纳入资产库）",
  "> - 提示词追加规则：中文澄清后用户用中文说自己想说的话/词汇卡住 = \"how do I say it\" 请求，**立即给自然英文 + TEACH，不二次澄清**。",
  "> - TutorTeachPanel 新增 onQuickCapture：「整句加入复习」按钮一键直接 captureAsset（chunk 资产，点击即用户确认，不弹 sheet），三态文案（加入中 / 已加入复习（N 张卡）/ 此前已收录）；chips 仍走 onPick 开 AssetCaptureSheet。",
  "> - ConversationPage 新增 quickCaptureTeach：按 turnKey+canonical 生成幂等键，chunk payload 带 register/example_en/example_zh/zh_intent，encounter origin 精确到 turnKey；面板接线 onQuickCapture。",
  "> - **验证**：全量 **51 链零失败**（s11-shadow-review 偶发 flaky，重跑通过）；tsc=0；vite build=0。",
  "> - **待真机复验（用户本人）**：制造乱句触发中文澄清 → 中文回答想说的意思 → AI 给英文+教学面板 → 点「整句加入复习」直接变\"已加入复习（N 张卡）\"，复习队列出现该 chunk 卡；点 chips 仍弹 sheet。",
  ">",
  "",
].join("\r\n");
s = anchor + block + s.slice(anchor.length);
fs.writeFileSync(p, s);
console.log("patched ok");
