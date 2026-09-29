// 补充 tensor-cache.json 到两个 webllm 权重条目（WebLLM 加载时会请求）。
const fs = require("node:fs");
const crypto = require("node:crypto");
const msP = "D:/vibe coding/英语学习/app-electron/model-store.cjs";

const jobs = [
  { id: "webllm-qwen25-3b", constName: "PINNED_WEBLLM_QWEN25_3B",
    repo: "mlc-ai/Qwen2.5-3B-Instruct-q4f32_1-MLC", rev: "dfa91e859b714acfa489a1464297080656c3460d", expect: 164965 },
  { id: "webllm-qwen25-15b", constName: "PINNED_WEBLLM_QWEN25_15B",
    repo: "mlc-ai/Qwen2.5-1.5B-Instruct-q4f32_1-MLC", rev: "a822ee410075710c9673005eafa017b90136b85d", expect: 124489 },
];

(async () => {
  let s = fs.readFileSync(msP, "utf8");
  for (const j of jobs) {
    const url = `https://hf-mirror.com/${j.repo}/resolve/${j.rev}/tensor-cache.json`;
    const r = await fetch(url, { headers: { "User-Agent": "english-base-electron" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length !== j.expect) throw new Error(`size ${buf.length}/${j.expect}`);
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    console.log(j.id, "tensor-cache.json", buf.length, sha);

    // 以该条目 const 声明为起点定位作用域
    const decl = `const ${j.constName} = {`;
    const declIdx = s.indexOf(decl);
    if (declIdx < 0) throw new Error("decl missing: " + j.constName);
    const anchor = `{ path: "ndarray-cache.json", bytes: `;
    const idx = s.indexOf(anchor, declIdx);
    if (idx < 0) throw new Error("ndarray rec anchor missing");
    const lineEnd = s.indexOf("\n", idx);
    const line = s.slice(idx, lineEnd);
    const newLine = line + `    { path: "tensor-cache.json", bytes: ${buf.length}, sha256: "${sha}" },`;
    s = s.slice(0, idx) + newLine + s.slice(lineEnd);

    const tbAnchor = `${j.constName}.totalBytes = `;
    const tbIdx = s.indexOf(tbAnchor);
    const tbLineEnd = s.indexOf("\n", tbIdx);
    const oldTb = Number(s.slice(tbIdx + tbAnchor.length, tbLineEnd).trim().replace(/;/g, ""));
    s = s.slice(0, tbIdx) + tbAnchor + (oldTb + buf.length) + ";" + s.slice(tbLineEnd);

    const active = `D:/vibe coding/英语学习/app-electron/data/models/${j.repo}/resolve/${j.rev}/tensor-cache.json`;
    fs.writeFileSync(active, buf);
  }
  fs.writeFileSync(msP, s);
  console.log("tensor-cache added to catalog and active dirs");
})().catch((e) => { console.error(e); process.exit(1); });
