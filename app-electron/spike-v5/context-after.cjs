// spike-v5/context-after.cjs — 抽取 after 文本中残余问题词的上下文
"use strict";
const path = require("node:path");
const { extractText } = require("../import-tools.cjs");
const ROOT = path.join(__dirname, "..");
const FIX = path.join(ROOT, "test-fixtures", "pdf");
const targets = {
  "attention.pdf": ["łukasz", "lukasz", "llion", "xception", "d_model", "d_ff", "log_k", "dmodel", "d f f"],
  "vae.pdf": ["tional", "subse", "quently", "eters", "ıve", "Subse", "Ma-", "param-"],
};
(async () => {
  for (const [file, words] of Object.entries(targets)) {
    const { text } = await extractText(path.join(FIX, file));
    fs: for (const w of words) {
      let idx = -1, n = 0;
      while ((idx = text.indexOf(w, idx + 1)) !== -1 && n < 3) {
        console.log(`[${file}] ${JSON.stringify(w)} :: …${text.slice(Math.max(0, idx - 90), idx + 90).replace(/\n/g, "⏎")}…`);
        n++;
      }
      if (n === 0) console.log(`[${file}] ${JSON.stringify(w)} :: 未出现`);
    }
    console.log("—".repeat(60));
  }
})();
