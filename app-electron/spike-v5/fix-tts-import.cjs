const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/tts.ts";
let s = fs.readFileSync(p, "utf8");
const old = `import { splitSentences, planKokoroChunks, drainSentences, planStreamQueue } from "./tts-chunks";`;
const neu = `import { splitSentences, planKokoroChunks, planStreamQueue } from "./tts-chunks";`;
if (!s.includes(old)) throw new Error("import anchor missing");
s = s.replace(old, neu);
fs.writeFileSync(p, s);
console.log("unused drainSentences import removed");
