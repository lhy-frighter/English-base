// q4f16 可信清单生成器：固定 commit 7690aaaa，下载全部文件计算 bytes+sha256。
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const sha256Hex = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const M = { id: "webllm-qwen25-3b-f16", repo: "mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC", revision: "7690aaaa46df36b1be0fe93b9c9abac0497eff6c" };
const STATIC = ["mlc-chat-config.json", "tokenizer.json", "tokenizer_config.json", "ndarray-cache.json", "tensor-cache.json"];
const dir = path.join(__dirname, "gen-webllm", M.id);
fs.mkdirSync(dir, { recursive: true });
const base = `https://hf-mirror.com/${M.repo}/resolve/${M.revision}/`;

async function fetchBuf(url, expectSize) {
  let lastErr;
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "english-base-electron" }, redirect: "follow" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (expectSize && buf.length !== expectSize) throw new Error(`size ${buf.length}/${expectSize}`);
      return buf;
    } catch (e) {
      lastErr = e;
      console.log(`GEN retry ${a} ${url.slice(-50)} :: ${e.message}`);
      await sleep(1500 * (a + 1));
    }
  }
  throw lastErr;
}

(async () => {
  const files = [];
  for (const f of STATIC) {
    const local = path.join(dir, f);
    let buf;
    if (fs.existsSync(local) && fs.statSync(local).size > 0) buf = fs.readFileSync(local);
    else { buf = await fetchBuf(base + f); fs.writeFileSync(local, buf); }
    files.push({ path: f, bytes: buf.length, sha256: sha256Hex(buf) });
    console.log(`GEN static ${f} ${buf.length}`);
  }
  const nd = JSON.parse(fs.readFileSync(path.join(dir, "ndarray-cache.json"), "utf8"));
  for (let i = 0; i < nd.records.length; i++) {
    const rec = nd.records[i];
    const local = path.join(dir, rec.dataPath);
    let buf;
    if (fs.existsSync(local) && fs.statSync(local).size === rec.nbytes) buf = fs.readFileSync(local);
    else { buf = await fetchBuf(base + rec.dataPath, rec.nbytes); fs.writeFileSync(local, buf); }
    files.push({ path: rec.dataPath, bytes: buf.length, sha256: sha256Hex(buf) });
    console.log(`GEN shard ${rec.dataPath} ${buf.length} (${i + 1}/${nd.records.length})`);
  }
  const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
  fs.writeFileSync(path.join(__dirname, "webllm-f16-catalog.generated.json"),
    JSON.stringify({ id: M.id, repo: M.repo, revision: M.revision, totalBytes, files }, null, 2));
  console.log("GEN DONE total", totalBytes);
})().catch((e) => { console.error("GEN FATAL", e); process.exit(1); });
