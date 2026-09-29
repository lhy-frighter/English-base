const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/tts.ts";
let s = fs.readFileSync(p, "utf8");

// 1) 句间间隙常量
const oldCmt = `// —— Kokoro 播放层 ——
let actx: AudioContext | null = null;`;
const newCmt = `// 句与句之间在模型自然尾音之外再补的很短间隙（句内停顿完全交给模型，不人工插入）
const SENTENCE_GAP_MS = 170;

// —— Kokoro 播放层 ——
let actx: AudioContext | null = null;`;
if (!s.includes(oldCmt)) throw new Error("kokoro layer anchor missing");
s = s.replace(oldCmt, newCmt);

// 2) 流式：句末按是否有下一句补间隙
const oldPlan = `  const playKokoroSentence = async (sentence: string, endOffset: number): Promise<void> => {
    const chunks = planKokoroChunks(sentence);
    for (const c of chunks) {`;
const newPlan = `  const playKokoroSentence = async (sentence: string, endOffset: number): Promise<void> => {
    const chunks = planKokoroChunks(sentence);
    // 后面还排着句子时才在句末补短间隙；没有下一句则保留模型自然收尾
    if (chunks.length) chunks[chunks.length - 1].pause = queue.length ? SENTENCE_GAP_MS : 0;
    for (const c of chunks) {`;
if (!s.includes(oldPlan)) throw new Error("playKokoroSentence anchor missing");
s = s.replace(oldPlan, newPlan);

// 3) SAPI 语速自然化
const oldRate1 = `  u.rate = opts.rate ?? 0.92;`;
const newRate1 = `  u.rate = opts.rate ?? 1.0;`;
if (!s.includes(oldRate1)) throw new Error("sapi rate anchor missing");
s = s.replace(oldRate1, newRate1);
const oldRate2 = `      u.rate = 0.95;`;
const newRate2 = `      u.rate = 1.0;`;
if (!s.includes(oldRate2)) throw new Error("streaming sapi rate anchor missing");
s = s.replace(oldRate2, newRate2);

fs.writeFileSync(p, s);
console.log("tts.ts human-rhythm wiring applied");
