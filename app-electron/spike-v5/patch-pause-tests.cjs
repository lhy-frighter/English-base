const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/test/tts-chunks.ts";
let s = fs.readFileSync(p, "utf8");
const repl = [
  [`check("逗号停顿190", cs[0].pause === 190, pauses(cs));`,
   `check("逗号停顿100", cs[0].pause === 100, pauses(cs));`],
  [`check("句末停顿430", cs[0].pause === 430, pauses(cs));`,
   `check("句末停顿260", cs[0].pause === 260, pauses(cs));`],
  [`check("破折号停顿280", cs[0].pause === 280, pauses(cs));`,
   `check("破折号停顿150", cs[0].pause === 150, pauses(cs));`],
  [`check("换行停顿520可命中", pauseAfter("Line one\\n") === 520, pauses(cs));`,
   `check("换行停顿340可命中", pauseAfter("Line one\\n") === 340, pauses(cs));`],
  [`check("换行首段停顿520", cs[0].pause === 520, pauses(cs));`,
   `check("换行首段停顿340", cs[0].pause === 340, pauses(cs));`],
  [`check("句级:句末停顿380", cs[0].pause === 380, cs.map((c) => c.pause));`,
   `check("句级:句末停顿240", cs[0].pause === 240, cs.map((c) => c.pause));`],
  [`check("句级:换行停顿520", cs[0].pause === 520, cs.map((c) => c.pause));`,
   `check("句级:换行停顿340", cs[0].pause === 340, cs.map((c) => c.pause));`],
  [`check("播放:句间停顿430", cs[0].pause === 430, String(cs[0].pause));`,
   `check("播放:句间停顿260", cs[0].pause === 260, String(cs[0].pause));`],
];
for (const [a, b] of repl) {
  if (!s.includes(a)) throw new Error("anchor missing: " + a);
  s = s.replace(a, b);
}
fs.writeFileSync(p, s);
console.log("pause assertions updated:", repl.length);
