// 临时勘查：transformers 3.8.1 dtype → 文件名后缀映射
const fs = require("fs");
const s = fs.readFileSync(__dirname + "/../node_modules/@huggingface/transformers/dist/transformers.js", "utf8");
for (const pat of ["model_uint8", "model_quantized", "q8f16", "model_q8"]) {
  let from = 0, n = 0;
  while (n < 3) {
    const i = s.indexOf(pat, from);
    if (i < 0) break;
    console.log("---", pat, "@", i, "\n", s.slice(Math.max(0, i - 260), i + 120).replace(/\s+/g, " "));
    from = i + 1; n++;
  }
}
