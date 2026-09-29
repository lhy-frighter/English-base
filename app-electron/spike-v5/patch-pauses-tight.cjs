const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/tts-chunks.ts";
let s = fs.readFileSync(p, "utf8");
const oldS = `const pause = /\\n\\s*$/.test(part) ? 520 : /[.!?…]/.test(part) ? 380 : 0;`;
const newS = `const pause = /\\n\\s*$/.test(part) ? 340 : /[.!?…]/.test(part) ? 240 : 0;`;
if (!s.includes(oldS)) throw new Error("splitSentences pause anchor missing");
s = s.replace(oldS, newS);
fs.writeFileSync(p, s);
console.log("splitSentences pauses tightened");
