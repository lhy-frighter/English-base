const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let doc = fs.readFileSync(p, "utf8");
const EOL = "\r\n";
const entry = [
"> 更新：2026-09-27 · **S14-1C 真机问题修复（打断/中文兜底/语法纠错）**（用户自行加入通话落库与 e2e/call-loop 测试链后，真机发现三项行为不达标，已修）",
"> - **打断可靠性**：环形缓冲 RING_FRAMES 4→8（512ms→1024ms，覆盖 VAD 确认延迟，解决开口被截成 \"Wait.\"/\"Never mind. I.\"）；新增保证性兜底——AI 说话/思考相位时顶栏显示「✋ 我要说话」按钮（manualInterrupt，外放 AEC 压制本地 VAD 时用户必能触发打断）。本地 Silero + 服务端 speech_started 双路触发保留。",
"> - **中文兜底**：指令升级为强制——用户消息含任何中文（含中英混说）必须先用简体中文解释自然说法、再给完整英文句子、再继续英文；禁止只用英文回答中文问题。",
"> - **语法纠错**：旧指令\"只纠正影响理解的错误\"改为——发现语法/时态/词形错误（如 Yesterday I go）必须用一行 \"Say: <正确句子>\" 纠正后继续（可用中文解释规则），不做长篇讲解。",
"> - **验证**：tsc=0；npm test 全绿（含用户新增 realtime-relay-e2e 11 项、call-loop 15 项）；vite build=0。待真机复验 G3/G4 后再裁决 S14-2。",
">",
];
const lines = doc.split(EOL);
lines.splice(1, 0, entry.join(EOL));
fs.writeFileSync(p, lines.join(EOL));
console.log("handoff patched");
