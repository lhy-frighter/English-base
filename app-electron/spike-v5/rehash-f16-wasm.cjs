const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const name = "Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm";
const file = path.join(__dirname, "..", "data", "webllm-lib-cache", name);
const buf = fs.readFileSync(file);
console.log(name, buf.length, crypto.createHash("sha256").update(buf).digest("hex"));
