const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/model-store.cjs";
let s = fs.readFileSync(p, "utf8");
const oldE = "  ModelStore, TRUSTED_CATALOG, PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K,\n";
const newE = "  ModelStore, TRUSTED_CATALOG, PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K,\n  PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B,\n";
if (!s.includes(oldE)) { console.error("export line anchor missing"); process.exit(1); }
s = s.replace(oldE, newE);
fs.writeFileSync(p, s);
console.log("weight exports added");
