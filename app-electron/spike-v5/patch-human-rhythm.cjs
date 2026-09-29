const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/tts-chunks.ts";
let s = fs.readFileSync(p, "utf8");

const oldBlock = `const BOUNDARY_PUNCT = /[,.;:!?…—)\\]"”’]$/;

// Kokoro 流式播放规划：意群切分（splitClauses，pauses 裁决）+ 首块强制切短（ADR-5 条件：
// 热身之后首音仍需 ≤1.5s 量级，首个合成块不超过约 firstMaxWords 个词，不等第一个逗号）。
// 首块被硬切时 head.pause=0 且 seamless=true（裁掉模型句尾静音，避免非停顿点断层）；
// 余块若落在意群边界（带标点）则保留模型自然尾音，否则同样 seamless。
export function planKokoroChunks(input: string, firstMaxWords = 6): PlayChunk[] {
  const clauses = splitClauses(input);
  if (!clauses.length) return [];
  const out: PlayChunk[] = [];
  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    if (i !== 0) { out.push({ text: c.text, pause: c.pause }); continue; }
    const words = c.text.split(/\\s+/).filter(Boolean);
    if (words.length <= firstMaxWords) { out.push({ text: c.text, pause: c.pause }); continue; }
    const head = words.slice(0, firstMaxWords).join(" ");
    const tail = words.slice(firstMaxWords).join(" ");
    out.push({ text: head, pause: 0, seamless: true });
    out.push({ text: tail, pause: c.pause, seamless: !BOUNDARY_PUNCT.test(tail.trim()) });
  }
  return out;
}`;

const newBlock = `// 人类节奏原则（v2.40）：句内逗号/破折号处"要不要停、停多久、语调升降"是模型结合全句
// 语境产出的。人工把句子切成意群、逐块独立合成再拼接固定静音，会让每块都带上句终语调、
// 所有停顿千篇一律，听起来像"念清单"。因此除为首音延迟硬切的首块外，整句一次性合成，
// 把句内节奏完全交给模型；只在句与句之间补一个很短的间隙（由播放层按是否有下一句决定）。
function splitTailForLength(text: string): PlayChunk[] {
  const pieces = splitLongSentence(text); // 超长兜底：优先在逗号/分号处断开
  return pieces.map((piece, i) => ({
    text: piece,
    pause: 0,
    seamless: i < pieces.length - 1, // 句中安全切开的块裁掉模型尾音，保持连贯
  }));
}

// Kokoro 播放规划：首块 ≤ firstMaxWords 词（硬切、seamless 裁尾，保证首音延迟），
// 之后整句其余部分一次性合成，保留模型对句内标点与语调的自然处理。
export function planKokoroChunks(input: string, firstMaxWords = 6): PlayChunk[] {
  const text = input.replace(/\\s+/g, " ").trim();
  if (!text) return [];
  const words = text.split(/\\s+/);
  const out: PlayChunk[] = [];
  if (words.length <= firstMaxWords) {
    out.push({ text, pause: 0 });
  } else {
    const head = words.slice(0, firstMaxWords).join(" ");
    out.push({ text: head, pause: 0, seamless: true });
    const tail = text.slice(head.length).trim();
    if (tail) out.push(...splitTailForLength(tail));
  }
  return out;
}`;

if (!s.includes(oldBlock)) throw new Error("planKokoroChunks block anchor missing");
s = s.replace(oldBlock, newBlock);
fs.writeFileSync(p, s);
console.log("planKokoroChunks rewritten to human-rhythm model");
