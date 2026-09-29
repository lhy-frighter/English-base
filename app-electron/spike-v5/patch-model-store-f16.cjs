const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/model-store.cjs";
let s = fs.readFileSync(p, "utf8");

// 1) lib 条目加 f16 wasm
const libAnchor = `    { path: "Qwen2-1.5B-Instruct-q4f32_1_cs1k-webgpu.wasm", bytes: 5106483,
      sha256: "7c18e20929f6a1145f985c4bdcf9ce8beec67f2445c91b361c842d323758060d",
      cdnUrl: JSDELIVR_WEBLLM_LIB_PREFIX + "Qwen2-1.5B-Instruct-q4f32_1_cs1k-webgpu.wasm" },
  ],`;
const libReplace = `    { path: "Qwen2-1.5B-Instruct-q4f32_1_cs1k-webgpu.wasm", bytes: 5106483,
      sha256: "7c18e20929f6a1145f985c4bdcf9ce8beec67f2445c91b361c842d323758060d",
      cdnUrl: JSDELIVR_WEBLLM_LIB_PREFIX + "Qwen2-1.5B-Instruct-q4f32_1_cs1k-webgpu.wasm" },
    { path: "Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm", bytes: 5438957,
      sha256: "bae8a6d2718f52e2ed232f069c175b0858e3090ebfe2b56ca2edcb4bd40305a",
      cdnUrl: JSDELIVR_WEBLLM_LIB_PREFIX + "Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm" },
  ],`;
if (!s.includes(libAnchor)) throw new Error("lib anchor missing");
s = s.replace(libAnchor, libReplace);

// 2) 构造 f16 PINNED 条目
const gen = JSON.parse(fs.readFileSync("D:/vibe coding/英语学习/app-electron/spike-v5/webllm-f16-catalog.generated.json", "utf8"));
const f = (path) => gen.files.find((x) => x.path === path);
const lines = [];
lines.push(`// —— V8-2b+ 本地对话大脑（默认档）：mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC @ ${gen.revision}（固定 commit；4 位权重 + FP16 计算，Apache-2.0）——`);
lines.push(`// 与 q4f32 同模型、质量基本无损，显存 2894→2505MB；WebLLM 实际加载项逐文件字节+SHA256 预置。`);
lines.push(`const PINNED_WEBLLM_QWEN25_3B_F16 = {`);
lines.push(`  id: "webllm-qwen25-3b-f16",`);
lines.push(`  repo: "mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC",`);
lines.push(`  revision: "${gen.revision}",`);
lines.push(`  dtype: "q4f16",`);
lines.push(`  name: "Qwen2.3B（本地对话大脑，默认 q4f16）",`);
lines.push(`  sizeNote: "约 1.6GB",`);
lines.push(`  license: { model: "Apache-2.0（Qwen2.5 MLC 权重）", url: "https://huggingface.co/mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC" },`);
lines.push(`  files: [`);
for (const name of ["mlc-chat-config.json", "tokenizer.json", "tokenizer_config.json", "ndarray-cache.json", "tensor-cache.json"]) {
  const r = f(name);
  lines.push(`    { path: "${name}", bytes: ${r.bytes}, sha256: "${r.sha256}" },`);
}
for (const r of gen.files.filter((x) => /params_shard_\d+\.bin/.test(x.path))) {
  lines.push(`    { path: "${r.path}", bytes: ${r.bytes}, sha256: "${r.sha256}" },`);;
}
lines.push(`  ],`);
lines.push(`};`);
lines.push(`PINNED_WEBLLM_QWEN25_3B_F16.totalBytes = ${gen.totalBytes};`);
lines.push(``);
const block = lines.join("\n");

const anchor3b = `PINNED_WEBLLM_QWEN25_3B.totalBytes = 1743558832;\n`;
if (!s.includes(anchor3b)) throw new Error("3b total anchor missing");
s = s.replace(anchor3b, anchor3b + block + "\n");

// 3) TRUSTED_CATALOG
const catAnchor = `const TRUSTED_CATALOG = [PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B];`;
const catReplace = `const TRUSTED_CATALOG = [PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K, PINNED_WEBLLM_QWEN25_3B_F16, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B];`;
if (!s.includes(catAnchor)) throw new Error("catalog anchor missing");
s = s.replace(catAnchor, catReplace);

// 4) exports
const exAnchor = `  PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B,`;
const exReplace = `  PINNED_WEBLLM_QWEN25_3B_F16, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B,`;
if (!s.includes(exAnchor)) throw new Error("export anchor missing");
s = s.replace(exAnchor, exReplace);

fs.writeFileSync(p, s);
console.log("model-store.cjs patched with f16 entry");
