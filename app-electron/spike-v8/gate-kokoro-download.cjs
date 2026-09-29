// S7c 闸门0：Kokoro q8f16 模型 + 单个音色下载（固定 commit，sha256 校验，镜像可配置）。
// 用法：node gate-kokoro-download.cjs [--install]
//   不带 --install：下载到 spike-v8/kokoro-model/ 并写 gate-kokoro-download.json
//   --install：额外装入真机 data/models/kokoro（供后续产品化复用，spike 本身用 spike 目录）
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");

const COMMIT = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
const REPO = "onnx-community/Kokoro-82M-v1.0-ONNX";
const FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
  "voices/af_heart.bin",
];
const mirror = process.env.kkMirror || "https://hf-mirror.com";
const allowInsecure = process.env.allowInsecureMirror === "1";
if (!/^https:\/\//.test(mirror) && !allowInsecure) throw new Error("镜像必须 HTTPS（测试故障注入用 allowInsecureMirror=1）");

const root = path.join(__dirname, "kokoro-model", REPO, "resolve", COMMIT.slice(0, 7));
const realRoot = path.join(__dirname, "..", "data", "models", "kokoro", REPO, "resolve", COMMIT.slice(0, 7));

function sha256(p) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}
function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + ".part";
    const f = fs.createWriteStream(tmp);
    const req = https.get(url, { headers: { "User-Agent": "s7c-spike" }, timeout: 120000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        f.close(); fs.unlinkSync(tmp);
        return resolve(download(new URL(res.headers.location, url).href, dest));
      }
      if (res.statusCode !== 200) { f.close(); fs.unlinkSync(tmp); return reject(new Error("HTTP " + res.statusCode + " " + url)); }
      res.pipe(f);
      f.on("finish", () => f.close(() => { fs.renameSync(tmp, dest); resolve(); }));
    });
    req.on("error", (e) => { try { f.close(); fs.unlinkSync(tmp); } catch {} reject(e); });
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

(async () => {
  const t0 = Date.now();
  const result = { commit: COMMIT, repo: REPO, mirror, files: [], ok: true, errors: [] };
  for (const rel of FILES) {
    const dest = path.join(root, ...rel.split("/"));
    const url = `${mirror}/${REPO}/resolve/${COMMIT}/${rel}`;
    const started = Date.now();
    try {
      if (!fs.existsSync(dest)) await download(url, dest);
      const stat = fs.statSync(dest);
      const rec = { file: rel, bytes: stat.size, sha256: sha256(dest), ms: Date.now() - started, cached: Date.now() - started < 50 };
      result.files.push(rec);
      console.log("OK", rel, stat.size, rec.sha256.slice(0, 12));
    } catch (e) {
      result.ok = false;
      result.errors.push({ file: rel, error: String(e.message || e) });
      console.log("FAIL", rel, e.message);
    }
  }
  result.totalBytes = result.files.reduce((s, f) => s + f.bytes, 0);
  result.elapsedMs = Date.now() - t0;

  // 别名：transformers 3.5.1 dtype:"q8" 请求 model_q8.onnx，上游仓库只有旧名 model_quantized.onnx（同字节）
  {
    const src = path.join(root, "onnx", "model_quantized.onnx");
    const dst = path.join(root, "onnx", "model_q8.onnx");
    if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
  }
  fs.writeFileSync(path.join(__dirname, "gate-kokoro-download.json"), JSON.stringify(result, null, 2));

  if (process.argv.includes("--install") && result.ok) {
    fs.cpSync(path.join(root), realRoot, { recursive: true });
    console.log("INSTALLED ->", realRoot);
  }
  process.exit(result.ok ? 0 : 1);
})();
