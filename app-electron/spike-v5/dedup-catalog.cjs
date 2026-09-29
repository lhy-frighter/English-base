const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/model-store.cjs";
let s = fs.readFileSync(p, "utf8");
const line = "const TRUSTED_CATALOG = [PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B];";
const fixed = "const TRUSTED_CATALOG = [PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B];";
if (!s.includes(line)) { console.error("dup array line not found"); process.exit(1); }
s = s.replace(line, fixed);
fs.writeFileSync(p, s);
console.log("deduped catalog array");
