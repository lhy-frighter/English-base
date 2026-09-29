const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/test/model-catalog.cjs";
let s = fs.readFileSync(p, "utf8");

// 1) 导入新常量
const oldImp = `const { TRUSTED_CATALOG, PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M } = require("../model-store.cjs");`;
const newImp = `const { TRUSTED_CATALOG, PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M,
  PINNED_WEBLLM_LIB_CS1K, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B } = require("../model-store.cjs");`;
if (!s.includes(oldImp)) { console.error("import anchor missing"); process.exit(1); }
s = s.replace(oldImp, newImp);

// 2) 循环里增加 jsdelivr 分支（在 gcs-gz 分支之后）
const oldBranch = `  if (m.transport === "gcs-gz") {`;
const jsBranch = `  if (m.transport === "jsdelivr") {
    // WebLLM wasm lib：revision 为标签，文件带 cdnUrl（HTTPS）
    check(\`\${m.id} revision 非空标签\`, typeof m.revision === "string" && m.revision.length >= 8, m.revision);
    let total = 0, filesOk = true;
    for (const f of m.files) {
      total += f.bytes;
      if (!(f.bytes > 0 && HEX64.test(f.sha256) && /^https:\\/\\/cdn\\.jsdelivr\\.net\\//.test(f.cdnUrl || ""))) filesOk = false;
    }
    check(\`\${m.id} 所有文件字节/哈希/cdnUrl 合法\`, filesOk);
    check(\`\${m.id} totalBytes 与明细一致\`, total === m.totalBytes, \`\${total}/\${m.totalBytes}\`);
  } else if (m.transport === "gcs-gz") {`;
if (!s.includes(oldBranch)) { console.error("branch anchor missing"); process.exit(1); }
s = s.replace(oldBranch, jsBranch);

// 3) HF 通道的 minFiles 判断：webllm 权重条目文件数多
const oldMin = `    const minFiles = m.id === "kokoro-82m" ? 5 : 7;`;
const newMin = `    const minFiles = m.id === "kokoro-82m" ? 5
      : m.id === "webllm-qwen25-3b" ? 66
      : m.id === "webllm-qwen25-15b" ? 34 : 7;`;
if (!s.includes(oldMin)) { console.error("minFiles anchor missing"); process.exit(1); }
s = s.replace(oldMin, newMin);

// 4) 清单数量检查改为 7 个
const oldCount = `check("清单含 tiny.en / base / bergamot / kokoro 四个模型",
  TRUSTED_CATALOG.length === 4 &&
  TRUSTED_CATALOG.some((m) => m.id === "whisper-tiny.en") &&
  TRUSTED_CATALOG.some((m) => m.id === "whisper-base") &&
  TRUSTED_CATALOG.some((m) => m.id === "bergamot-enzh") &&
  TRUSTED_CATALOG.some((m) => m.id === "kokoro-82m"));`;
const newCount = `check("清单含 7 个模型（含 webllm 三件）",
  TRUSTED_CATALOG.length === 7 &&
  TRUSTED_CATALOG.some((m) => m.id === "whisper-tiny.en") &&
  TRUSTED_CATALOG.some((m) => m.id === "whisper-base") &&
  TRUSTED_CATALOG.some((m) => m.id === "bergamot-enzh") &&
  TRUSTED_CATALOG.some((m) => m.id === "kokoro-82m") &&
  TRUSTED_CATALOG.some((m) => m.id === "webllm-lib-cs1k") &&
  TRUSTED_CATALOG.some((m) => m.id === "webllm-qwen25-3b") &&
  TRUSTED_CATALOG.some((m) => m.id === "webllm-qwen25-15b"));`;
if (!s.includes(oldCount)) { console.error("count anchor missing"); process.exit(1); }
s = s.replace(oldCount, newCount);

// 5) 末尾加 webllm 专项检查
const tail = `console.log(\`\\n\${pass} 通过 / \${fail} 失败 / model-catalog\`);`;
const extra = `// V8-2a WebLLM 条目
check("webllm lib 含两个 cs1k wasm", PINNED_WEBLLM_LIB_CS1K.files.length === 2 &&
  PINNED_WEBLLM_LIB_CS1K.files.every((f) => /\\.wasm$/.test(f.path)));
check("webllm 3B 固定 commit dfa91e85", PINNED_WEBLLM_QWEN25_3B.revision.startsWith("dfa91e85"), PINNED_WEBLLM_QWEN25_3B.revision);
check("webllm 1.5B 固定 commit a822ee41", PINNED_WEBLLM_QWEN25_15B.revision.startsWith("a822ee41"), PINNED_WEBLLM_QWEN25_15B.revision);
check("webllm 3B 约 1.6GB（1.4–1.9GB）", PINNED_WEBLLM_QWEN25_3B.totalBytes > 1.4 * 1073741824 && PINNED_WEBLLM_QWEN25_3B.totalBytes < 1.9 * 1073741824, String(PINNED_WEBLLM_QWEN25_3B.totalBytes));
check("webllm 1.5B 约 760MB（650–900MB）", PINNED_WEBLLM_QWEN25_15B.totalBytes > 650 * 1048576 && PINNED_WEBLLM_QWEN25_15B.totalBytes < 900 * 1048576, String(PINNED_WEBLLM_QWEN25_15B.revision));
check("webllm 3B 含 62 shard", PINNED_WEBLLM_QWEN25_3B.files.filter((f) => /params_shard_\\d+\\.bin/.test(f.path)).length === 62);
check("webllm 1.5B 含 30 shard", PINNED_WEBLLM_QWEN25_15B.files.filter((f) => /params_shard_\\d+\\.bin/.test(f.path)).length === 30);

` + tail;
if (!s.includes(tail)) { console.error("tail anchor missing"); process.exit(1); }
s = s.replace(tail, extra);

fs.writeFileSync(p, s);
console.log("model-catalog test updated");
