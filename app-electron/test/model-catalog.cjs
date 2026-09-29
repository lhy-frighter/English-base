// 可信清单完整性回归：内置模型的固定 revision/哈希/许可证必须自洽，防止清单被误改。运行：node test/model-catalog.cjs
const { TRUSTED_CATALOG, PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M,
  PINNED_WEBLLM_LIB_CS1K, PINNED_WEBLLM_QWEN25_3B_F16, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B } = require("../model-store.cjs");

let pass = 0, fail = 0;
const check = (name, cond, extra) => { console.log((cond ? "PASS" : "FAIL"), name, extra ?? ""); cond ? pass++ : fail++; };
const HEX64 = /^[0-9a-f]{64}$/;
const SHA40 = /^[0-9a-f]{40}$/;

for (const m of TRUSTED_CATALOG) {
  if (m.transport === "jsdelivr") {
    // WebLLM wasm lib：revision 为标签，文件带 cdnUrl（HTTPS）
    check(`${m.id} revision 非空标签`, typeof m.revision === "string" && m.revision.length >= 8, m.revision);
    let total = 0, filesOk = true;
    for (const f of m.files) {
      total += f.bytes;
      if (!(f.bytes > 0 && HEX64.test(f.sha256) && /^https:\/\/cdn\.jsdelivr\.net\//.test(f.cdnUrl || ""))) filesOk = false;
    }
    check(`${m.id} 所有文件字节/哈希/cdnUrl 合法`, filesOk);
    check(`${m.id} totalBytes 与明细一致`, total === m.totalBytes, `${total}/${m.totalBytes}`);
  } else if (m.transport === "gcs-gz") {
    // GCS 翻译模型：revision 是 Mozilla 导出目录标签（非 git commit），4 个文件，每个带 gz 字节数与 gzUrl
    check(`${m.id} revision 非空标签`, typeof m.revision === "string" && m.revision.length >= 8, m.revision);
    check(`${m.id} 含 4 个文件`, m.files.length === 4, String(m.files.length));
    let total = 0, gzTotal = 0;
    let filesOk = true;
    for (const f of m.files) {
      total += f.bytes; gzTotal += f.gzBytes || 0;
      if (!(f.bytes > 0 && HEX64.test(f.sha256) && f.gzBytes > 0 && f.gzBytes < f.bytes && /^https:\/\/storage\.googleapis\.com\/.+\.gz$/.test(f.gzUrl || ""))) filesOk = false;
    }
    check(`${m.id} 所有文件字节/哈希/gz 元数据合法`, filesOk);
    check(`${m.id} totalBytes 与明细一致`, total === m.totalBytes, `${total}/${m.totalBytes}`);
    check(`${m.id} gz 字节合计一致`, gzTotal === m.files.reduce((s, f) => s + f.gzBytes, 0), String(gzTotal));
  } else {
    // Hugging Face 通道：固定 40 位 commit；ASR 模型至少 7 个文件，Kokoro 为 5 个
    const minFiles = m.id === "kokoro-82m" ? 5
      : m.id === "webllm-qwen25-3b-f16" ? 66
      : m.id === "webllm-qwen25-3b" ? 66
      : m.id === "webllm-qwen25-15b" ? 34 : 7;
    check(`${m.id} revision 为 40 位 commit`, SHA40.test(m.revision), m.revision);
    check(`${m.id} 至少含 ${minFiles} 个文件`, m.files.length >= minFiles, String(m.files.length));
    let total = 0;
    for (const f of m.files) {
      if (!(f.bytes > 0 && HEX64.test(f.sha256))) { check(`${m.id} ${f.path} 字节/哈希合法`, false); }
      total += f.bytes;
    }
    check(`${m.id} 所有文件字节与哈希合法`, m.files.every((f) => f.bytes > 0 && HEX64.test(f.sha256)));
    check(`${m.id} totalBytes 与明细一致`, total === m.totalBytes, `${total}/${m.totalBytes}`);
  }
  check(`${m.id} 许可证已标注`, !!m.license?.model && /^https:\/\//.test(m.license?.url || ""));
}
check("清单含 8 个模型（含 webllm 四件）",
  TRUSTED_CATALOG.length === 8 &&
  TRUSTED_CATALOG.some((m) => m.id === "whisper-tiny.en") &&
  TRUSTED_CATALOG.some((m) => m.id === "whisper-base") &&
  TRUSTED_CATALOG.some((m) => m.id === "bergamot-enzh") &&
  TRUSTED_CATALOG.some((m) => m.id === "kokoro-82m") &&
  TRUSTED_CATALOG.some((m) => m.id === "webllm-lib-cs1k") &&
  TRUSTED_CATALOG.some((m) => m.id === "webllm-qwen25-3b-f16") &&
  TRUSTED_CATALOG.some((m) => m.id === "webllm-qwen25-3b") &&
  TRUSTED_CATALOG.some((m) => m.id === "webllm-qwen25-15b"));
check("模型 id 唯一", new Set(TRUSTED_CATALOG.map((m) => m.id)).size === TRUSTED_CATALOG.length);
check("tiny.en 标记为英文单语", PINNED_WHISPER_TINY_EN.multilingual !== true);
check("base 标记为多语", PINNED_WHISPER_BASE.multilingual === true);
check("base q8 体积约 76MB（70–90MB 区间）", PINNED_WHISPER_BASE.totalBytes > 70 * 1048576 && PINNED_WHISPER_BASE.totalBytes < 90 * 1048576, String(PINNED_WHISPER_BASE.totalBytes));
check("bergamot 解压体积约 48MB（40–60MB 区间）", PINNED_BERGAMOT_ENZH.totalBytes > 40 * 1048576 && PINNED_BERGAMOT_ENZH.totalBytes < 60 * 1048576, String(PINNED_BERGAMOT_ENZH.totalBytes));
check("bergamot 标记 MPL-2.0", /MPL/i.test(PINNED_BERGAMOT_ENZH.license?.model || ""));
// Kokoro（ADR-5）
check("kokoro 固定 commit 1939ad2", PINNED_KOKORO_82M.revision.startsWith("1939ad2"), PINNED_KOKORO_82M.revision);
check("kokoro 含 q8 模型与 af_heart 音色",
  PINNED_KOKORO_82M.files.some((f) => f.path === "onnx/model_quantized.onnx") &&
  PINNED_KOKORO_82M.files.some((f) => f.path === "voices/af_heart.bin"));
check("kokoro 总体积约 89MB（85–95MB 区间）", PINNED_KOKORO_82M.totalBytes > 85 * 1048576 && PINNED_KOKORO_82M.totalBytes < 95 * 1048576, String(PINNED_KOKORO_82M.totalBytes));
check("kokoro 许可标注含 GPL 风险提示", /GPL/i.test(PINNED_KOKORO_82M.license?.model || ""));

// V8-2a WebLLM 条目
check("webllm lib 含三个 cs1k wasm", PINNED_WEBLLM_LIB_CS1K.files.length === 3 &&
  PINNED_WEBLLM_LIB_CS1K.files.every((f) => /\.wasm$/.test(f.path)));
check("webllm 3B-f16 固定 commit 7690aaaa", PINNED_WEBLLM_QWEN25_3B_F16.revision.startsWith("7690aaaa"), PINNED_WEBLLM_QWEN25_3B_F16.revision);
check("webllm 3B-f16 含 62 shard", PINNED_WEBLLM_QWEN25_3B_F16.files.filter((f) => /params_shard_\d+\.bin/.test(f.path)).length === 62);
check("webllm 3B-f16 约 1.6GB（1.4–1.9GB）", PINNED_WEBLLM_QWEN25_3B_F16.totalBytes > 1.4 * 1073741824 && PINNED_WEBLLM_QWEN25_3B_F16.totalBytes < 1.9 * 1073741824, String(PINNED_WEBLLM_QWEN25_3B_F16.totalBytes));
check("webllm 3B 固定 commit dfa91e85", PINNED_WEBLLM_QWEN25_3B.revision.startsWith("dfa91e85"), PINNED_WEBLLM_QWEN25_3B.revision);
check("webllm 1.5B 固定 commit a822ee41", PINNED_WEBLLM_QWEN25_15B.revision.startsWith("a822ee41"), PINNED_WEBLLM_QWEN25_15B.revision);
check("webllm 3B 约 1.6GB（1.4–1.9GB）", PINNED_WEBLLM_QWEN25_3B.totalBytes > 1.4 * 1073741824 && PINNED_WEBLLM_QWEN25_3B.totalBytes < 1.9 * 1073741824, String(PINNED_WEBLLM_QWEN25_3B.totalBytes));
check("webllm 1.5B 约 760MB（650–900MB）", PINNED_WEBLLM_QWEN25_15B.totalBytes > 650 * 1048576 && PINNED_WEBLLM_QWEN25_15B.totalBytes < 900 * 1048576, String(PINNED_WEBLLM_QWEN25_15B.revision));
check("webllm 3B 含 62 shard", PINNED_WEBLLM_QWEN25_3B.files.filter((f) => /params_shard_\d+\.bin/.test(f.path)).length === 62);
check("webllm 1.5B 含 30 shard", PINNED_WEBLLM_QWEN25_15B.files.filter((f) => /params_shard_\d+\.bin/.test(f.path)).length === 30);

console.log(`\n${pass} 通过 / ${fail} 失败 / model-catalog`);
process.exit(fail ? 1 : 0);
