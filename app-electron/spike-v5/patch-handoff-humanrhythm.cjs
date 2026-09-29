const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = ">   - **TTS 停顿紧凑化（v2.39）**";
if (!s.includes(anchor)) throw new Error("v2.39 note anchor missing");
const note = ">   - **TTS 人类节奏重构（v2.40）**：仅缩短固定停顿仍不自然——根因是把句子按意群切碎、逐块独立合成再拼接固定静音，每块都带句终语调、停顿千篇一律（\"念清单\"感）。改为：首块 ≤6 词硬切（保首音延迟、seamless 裁尾），之后整句其余部分一次性合成，句内逗号/破折号的停顿与语调完全交给模型按全句语境生成；只在句与句之间补 170ms 短间隙（播放层按是否有下一句决定）。超长句走 splitLongSentence 安全切分、句中块 seamless。SAPI 语速 0.92/0.95→1.0。tts-chunks 76 passed，全量 43 链/tsc/build 全绿。\r\n";
s = s.replace(anchor, note + anchor);
fs.writeFileSync(p, s);
console.log("handoff human-rhythm note added");
