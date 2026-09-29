// 把真实录音 webm 以 base64 内嵌为 smoke 素材（避免 nodeIntegration，模拟生产环境）
const fs = require("fs");
const src =
  "D:/vibe coding/英语学习/app-electron/data/regression/rmu3jtnky7f3c43.webm";
const out =
  "D:/vibe coding/英语学习/app-electron/spike-v5/vad-smoke-audio.ts";
const b64 = fs.readFileSync(src).toString("base64");
const body =
  "// 自动生成：VAD smoke 内嵌语音素材（base64 webm）\nexport const SPEECH_WEBM_B64 = " +
  JSON.stringify(b64) +
  ";\n";
fs.writeFileSync(out, body);
console.log("vad-smoke-audio.ts written, b64 len", b64.length);
