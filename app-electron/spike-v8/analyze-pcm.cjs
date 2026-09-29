const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/spike-v8/audio/out-pcm.pcm";
const b = fs.readFileSync(p);
console.log("bytes:", b.length);
// Hypothesis 1: int16 LE mono
const n16 = b.length >> 1;
let s16 = new Int16Array(b.buffer, b.byteOffset, n16);
let max16 = 0, sumAbs = 0, zeroFrac = 0;
for (let i = 0; i < s16.length; i++) {
  const v = Math.abs(s16[i]);
  if (v > max16) max16 = v;
  sumAbs += v;
  if (v < 50) zeroFrac++;
}
console.log("int16: samples=", n16, "max=", max16, "meanAbs=", Math.round(sumAbs / n16), "quietFrac=", (zeroFrac / n16).toFixed(3));
console.log("int16 @24k sec=", (n16 / 24000).toFixed(3), "@16k sec=", (n16 / 16000).toFixed(3));
// Hypothesis 2: float32
if (b.length % 4 === 0) {
  const f = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  let maxf = 0, bad = 0;
  for (const x of f) { if (!Number.isFinite(x)) bad++; else if (Math.abs(x) > maxf) maxf = Math.abs(x); }
  console.log("float32: n=", f.length, "max=", maxf, "nonfinite=", bad, "@24k sec=", (f.length / 24000).toFixed(3));
}
// first 12 int16 samples
console.log("first int16:", Array.from(s16.slice(0, 12)));
