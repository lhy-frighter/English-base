const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/tts.ts";
let s = fs.readFileSync(p, "utf8");

// 1) import
const oldImp = `import { splitSentences, planKokoroChunks, drainSentences } from "./tts-chunks";`;
const newImp = `import { splitSentences, planKokoroChunks, drainSentences, planStreamQueue } from "./tts-chunks";`;
if (!s.includes(oldImp)) throw new Error("import anchor missing");
s = s.replace(oldImp, newImp);

// 2) cursor declaration
const oldDecl = `export function startStreamingSpeaker(opts: StreamingSpeakerOpts): StreamingSpeaker {
  let buffer = "";
  let playedEnd = 0;`;
const newDecl = `export function startStreamingSpeaker(opts: StreamingSpeakerOpts): StreamingSpeaker {
  let buffer = "";
  let playedEnd = 0;
  let drainedChars = 0; // 已排入队列的文本游标：防止重复 feed 时旧句子反复入队`;
if (!s.includes(oldDecl)) throw new Error("decl anchor missing");
s = s.replace(oldDecl, newDecl);

// 3) process body
const oldProc = `  const process = async (cumulative: string, isFinal: boolean): Promise<void> => {
    buffer = cumulative;
    if (!opts.enabled) { playedEnd = buffer.length; return; }
    const { ready, rest } = drainSentences(buffer);
    let searchFrom = 0;
    const starts = ready.map((sentence) => {
      const idx = buffer.indexOf(sentence, searchFrom);
      searchFrom = idx + sentence.length;
      return idx;
    });
    ready.forEach((sentence, i) => {
      const endOffset = i < ready.length - 1 ? starts[i + 1] : buffer.length - rest.length;
      queue.push({ sentence, endOffset });
    });
    if (isFinal && rest.trim()) queue.push({ sentence: rest.trim(), endOffset: buffer.length });
    if (!queue.length) return;
    const b = await ensureBackend();
    if (b) await pump();
    else while (queue.length) playedEnd = Math.max(playedEnd, queue.shift()!.endOffset);
  };`;
const newProc = `  const process = async (cumulative: string, isFinal: boolean): Promise<void> => {
    buffer = cumulative;
    if (!opts.enabled) { playedEnd = buffer.length; return; }
    if (drainedChars > buffer.length) drainedChars = 0; // 防御：文本被整体替换
    const { queue: freshQueue, newDrainedChars } = planStreamQueue(buffer, drainedChars, isFinal);
    drainedChars = newDrainedChars;
    queue.push(...freshQueue);
    if (!queue.length) return;
    const b = await ensureBackend();
    if (b) await pump();
    else while (queue.length) playedEnd = Math.max(playedEnd, queue.shift()!.endOffset);
  };`;
if (!s.includes(oldProc)) throw new Error("process anchor missing");
s = s.replace(oldProc, newProc);

fs.writeFileSync(p, s);
console.log("streaming speaker dedup cursor applied");
