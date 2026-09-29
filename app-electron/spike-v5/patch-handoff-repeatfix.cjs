const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = ">   - **免费档 429/1305 硬化**";
if (!s.includes(anchor)) throw new Error("429 note anchor missing");
const note = ">   - **流式 TTS 重复朗读修复**：旧 process() 每次 feed 都把累计文本中的全部完整句重新入队，导致首句（如 \"Hi there!\"）反复朗读。新增纯函数 `planStreamQueue(buffer, drainedChars, isFinal)`（tts-chunks.ts）：维护已排程字符游标、只处理新增文本；drainSentences 同时返回 restOffset 精确定位残余（length 相减会被残余前空白吃掉首字母）。tts-chunks 测试扩到 77 passed（含逐句不重复、final 冲刷残余、endOffset 坐标）。\r\n";
s = s.replace(anchor, note + anchor);
fs.writeFileSync(p, s);
console.log("handoff repeat-fix note added");
