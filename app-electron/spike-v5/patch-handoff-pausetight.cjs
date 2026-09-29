const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = ">   - **流式 TTS 重复朗读修复**";
if (!s.includes(anchor)) throw new Error("repeat-fix note anchor missing");
const note = ">   - **TTS 停顿紧凑化（v2.39）**：耳听反馈旧节奏偏慢、句中停顿过长。根因：自然边界处 Kokoro 模型自带尾音静音，Worker 又在其后追加 pauseMs，停顿叠加。pauseAfter 各档下调——逗号/分号/冒号 190→100、破折号 280→150、句末 430→260、换行 520→340；SAPI splitSentences 句末 380→240、换行 520→340。tts-chunks 77 passed，全量 43 链/tsc/build 全绿。\r\n";
s = s.replace(anchor, note + anchor);
fs.writeFileSync(p, s);
console.log("handoff pause-tighten note added");
