const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/test/model-catalog.cjs";
let s = fs.readFileSync(p, "utf8");
const pairs = [
  [`      : m.id === "webllm-qwen25-3b" ? 66 :
      : m.id === "webllm-qwen25-15b" ? 34 : 7;`,
   `      : m.id === "webllm-qwen25-3b" ? 67 :
      : m.id === "webllm-qwen25-15b" ? 35 : 7;`],
  [`check("webllm 3B 含 62 shard", PINNED_WEBLLM_QWEN25_3B.files.filter((f) => /params_shard_\\d+\\.bin/.test(f.path)).length === 62);`,
   `check("webllm 3B 含 62 shard 与 tensor-cache", PINNED_WEBLLM_QWEN25_3B.files.filter((f) => /params_shard_\\d+\\.bin/.test(f.path)).length === 62 &&
  PINNED_WEBLLM_QWEN25_3B.files.some((f) => f.path === "tensor-cache.json"));`],
  [`check("webllm 1.5B 含 30 shard", PINNED_WEBLLM_QWEN25_15B.files.filter((f) => /params_shard_\\d+\\.bin/.test(f.path)).length === 30);`,
   `check("webllm 1.5B 含 30 shard 与 tensor-cache", PINNED_WEBLLM_QWEN25_15B.files.filter((f) => /params_shard_\\d+\\.bin/.test(f.path)).length === 30 &&
  PINNED_WEBLLM_QWEN25_15B.files.some((f) => f.path === "tensor-cache.json"));`],
];
for (const [a, b] of pairs) {
  if (!s.includes(a)) { console.error("anchor missing: " + a.slice(0, 70)); process.exit(1); }
  s = s.replace(a, b);
}
fs.writeFileSync(p, s);
console.log("catalog test expectations updated");
