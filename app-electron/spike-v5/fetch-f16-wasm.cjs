const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const prefix = "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/v0_2_84/base/";
const name = "Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm";
const dir = path.join(__dirname, "..", "data", "webllm-lib-cache");
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const r = await fetch(prefix + name, { redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(path.join(dir, name), buf);
  console.log("WASM", name, buf.length, crypto.createHash("sha256").update(buf).digest("hex"));
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
