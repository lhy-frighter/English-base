// V8-2a 可信清单生成器：从 hf-mirror 拉取固定 commit 的 WebLLM 模型文件，
// 计算 bytes + sha256，产出 catalog 片段（之后写入 model-store.cjs）。
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const sha256Hex = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODELS = [
  { id: "webllm-qwen25-3b", repo: "mlc-ai/Qwen2.5-3B-Instruct-q4f32_1-MLC", revision: "dfa91e859b714acfa489a1464297080656c3460d" },
  { id: "webllm-qwen25-15b", repo: "mlc-ai/Qwen2.5-1.5B-Instruct-q4f32_1-MLC", revision: "a822ee410075710c9673005eafa017b90136b85d" },
];
const STATIC_FILES = ["mlc-chat-config.json", "tokenizer.json", "tokenizer_config.json", "ndarray-cache.json"];
const genDir = path.join(__dirname, "gen-webllm");
fs.mkdirSync(genDir, { recursive: true });

async function fetchBuf(url, expectSize) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "english-base-electron" }, redirect: "follow" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (expectSize && buf.length !== expectSize) throw new Error(`size ${buf.length}/${expectSize}`);
      return buf;
    } catch (e) {
      lastErr = e;
      console.log(`GEN retry ${attempt} ${url.slice(-60)} :: ${e.message}`);
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

(async () => {
  const out = [];
  for (const m of MODELS) {
    const base = `https://hf-mirror.com/${m.repo}/resolve/${m.revision}/`;
    const dir = path.join(genDir, m.id);
    fs.mkdirSync(dir, { recursive: true });
    const files = [];
    for (const f of STATIC_FILES) {
      const local = path.join(dir, f);
      let buf;
      if (fs.existsSync(local) && fs.statSync(local).size > 0) buf = fs.readFileSync(local);
      else { buf = await fetchBuf(base + f); fs.writeFileSync(local, buf); }
      files.push({ path: f, bytes: buf.length, sha256: sha256Hex(buf) });
      console.log(`GEN ${m.id} ${f} ${buf.length}`);
    }
    const ndJson = JSON.parse(fs.readFileSync(path.join(dir, "ndarray-cache.json"), "utf8"));
    let totalBytes = files.reduce((s, f) => s + f.bytes, 0);
    for (let i = 0; i < ndJson.records.length; i++) {
      const rec = ndJson.records[i];
      const local = path.join(dir, rec.dataPath);
      let buf;
      if (fs.existsSync(local) && fs.statSync(local).size === rec.nbytes) {
        buf = fs.readFileSync(local);
      } else {
        buf = await fetchBuf(base + rec.dataPath, rec.nbytes);
        fs.writeFileSync(local, buf);
      }
      files.push({ path: rec.dataPath, bytes: buf.length, sha256: sha256Hex(buf) });
      totalBytes += buf.length;
      console.log(`GEN ${m.id} ${rec.dataPath} ${buf.length} (${i + 1}/${ndJson.records.length})`);
    }
    out.push({ id: m.id, repo: m.repo, revision: m.revision, totalBytes, files });
  }
  fs.writeFileSync(path.join(__dirname, "webllm-catalog.generated.json"), JSON.stringify(out, null, 2));
  console.log("GEN DONE");
})().catch((e) => { console.error("GEN FATAL", e); process.exit(1); });
