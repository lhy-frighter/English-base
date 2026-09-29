const fs = require("node:fs");
for (const f of ["p1-short.wav", "p2-long.wav", "p3-repeat.wav", "p4-greeting.wav"]) {
  const b = fs.readFileSync("D:/vibe coding/英语学习/app-electron/spike-v8/audio/" + f);
  const sr = b.readUInt32LE(24), ch = b.readUInt16LE(22), bits = b.readUInt16LE(34);
  console.log(f, "sr=" + sr, "ch=" + ch, "bits=" + bits, "bytes=" + b.length);
}
