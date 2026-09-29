(async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const crypto = require("node:crypto");
  const url = "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/v0_2_84/base/Qwen2-1.5B-Instruct-q4f32_1_cs1k-webgpu.wasm";
  const dir = path.join(__dirname, "..", "data", "webllm-lib-cache");
  fs.mkdirSync(dir, { recursive: true });
  const local = path.join(dir, "Qwen2-1.5B-Instruct-q4f32_1_cs1k-webgpu.wasm");
  let buf;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "english-base-electron" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      buf = Buffer.from(await r.arrayBuffer());
      break;
    } catch (e) {
      console.log("retry", attempt, e.message);
      await new Promise((x) => setTimeout(x, 1500 * (attempt + 1)));
    }
  }
  fs.writeFileSync(local, buf);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  console.log("saved", buf.length, sha);
})();
