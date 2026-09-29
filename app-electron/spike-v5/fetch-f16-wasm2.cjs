const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const name = "Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm";
const gh = "https://github.com/mlc-ai/binary-mlc-llm-libs/raw/main/web-llm-models/v0_2_84/base/" + name;
const sources = [
  "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/v0_2_84/base/" + name,
  "https://ghfast.top/" + gh,
  "https://gh-proxy.com/" + gh,
  "https://mirror.ghproxy.com/" + gh,
];
const dir = path.join(__dirname, "..", "data", "webllm-lib-cache");
fs.mkdirSync(dir, { recursive: true });
(async () => {
  let buf;
  for (const u of sources) {
    try {
      console.log("TRY", u.slice(0, 60));
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 60000);
      const r = await fetch(u, { redirect: "follow", signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) throw new Error("HTTP " + r.status);
      buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000000) throw new Error("too small " + buf.length);
      console.log("OK from", u.slice(0, 60), buf.length);
      break;
    } catch (e) { console.log("FAIL", e.message); }
  }
  if (!buf) throw new Error("all sources failed");
  fs.writeFileSync(path.join(dir, name), buf);
  console.log("WASM", name, buf.length, crypto.createHash("sha256").update(buf).digest("hex"));
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
