const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/model-store.cjs";
const gen = JSON.parse(fs.readFileSync("D:/vibe coding/英语学习/app-electron/spike-v5/webllm-catalog.generated.json", "utf8"));
let s = fs.readFileSync(p, "utf8");

const meta = {
  "webllm-qwen25-3b": {
    constName: "PINNED_WEBLLM_QWEN25_3B",
    id: "webllm-qwen25-3b",
    name: "Qwen2.5-3B（本地对话大脑，q4f32）",
    sizeNote: "约 1.6GB",
  },
  "webllm-qwen25-15b": {
    constName: "PINNED_WEBLLM_QWEN25_15B",
    id: "webllm-qwen25-15b",
    name: "Qwen2.5-1.5B（本地对话，低延迟/低配，q4f32）",
    sizeNote: "约 760MB",
  },
};

function emitEntry(g) {
  const m = meta[g.id];
  const lines = [];
  lines.push(`// —— V8-2a 本地对话大脑：${g.repo} @ ${g.revision}（固定 commit；WebLLM q4f32，Apache-2.0）——`);
  lines.push(`// WebLLM 实际加载项：mlc-chat-config / tokenizer / tokenizer_config / ndarray-cache + 全部 params shard，逐文件字节+SHA256 预置。`);
  lines.push(`const ${m.constName} = {`);
  lines.push(`  id: "${g.id}",`);
  lines.push(`  repo: "${g.repo}",`);
  lines.push(`  revision: "${g.revision}",`);
  lines.push(`  dtype: "q4f32",`);
  lines.push(`  name: "${m.name}",`);
  lines.push(`  sizeNote: "${m.sizeNote}",`);
  lines.push(`  license: { model: "Apache-2.0（Qwen2.5 MLC 权重）", url: "https://huggingface.co/${g.repo}" },`);
  lines.push(`  files: [`);
  for (const f of g.files) {
    lines.push(`    { path: ${JSON.stringify(f.path)}, bytes: ${f.bytes}, sha256: "${f.sha256}" },`);
  }
  lines.push(`  ],`);
  lines.push(`};`);
  lines.push(`${m.constName}.totalBytes = ${g.totalBytes};`);
  lines.push("");
  return lines.join("\n");
}

const anchor = "const TRUSTED_CATALOG = [";
if (!s.includes(anchor)) { console.error("catalog anchor missing"); process.exit(1); }
const block = gen.map(emitEntry).join("\n");
s = s.replace(anchor, block + anchor);

const oldArr = "const TRUSTED_CATALOG = [PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K];";
const newArr = "const TRUSTED_CATALOG = [PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B];";
if (!s.includes(oldArr)) { console.error("array anchor missing"); process.exit(1); }
s = s.replace(oldArr, newArr);

const oldExp = "PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K,";
const newExp = "PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B,";
if (!s.includes(oldExp)) { console.error("export anchor missing"); process.exit(1); }
s = s.replace(oldExp, newExp);

fs.writeFileSync(p, s);
console.log("webllm weight entries inserted:", gen.map((g) => g.id + " files=" + g.files.length).join(", "));
