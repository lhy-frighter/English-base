// 临时勘查：kokoro.web.js 内 ort 版本与 wasm 文件名构造
const fs = require("fs");
const s = fs.readFileSync(__dirname + "/vendor-kokoro/k/dist/kokoro.web.js", "utf8");
for (const pat of ["jsep", ".wasm", `version:"3`, "3.5.", "3.6.", "3.7.", "mjs"]) {
  const i = s.indexOf(pat);
  console.log("---", pat, i);
  if (i >= 0) console.log(s.slice(Math.max(0, i - 140), i + 180).replace(/\s+/g, " "));
}
const wasmLike = s.match(/["'`][\w./-]*\.wasm["'`]/g);
console.log("wasm literals:", [...new Set(wasmLike || [])].slice(0, 20));
const mjsLike = s.match(/ort-wasm[\w.$-]*/g);
console.log("ort-wasm tokens:", [...new Set(mjsLike || [])].slice(0, 20));
