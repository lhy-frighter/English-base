const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/test/model-store.cjs";
let s = fs.readFileSync(p, "utf8");
const anchor = "  console.log(`\\n${pass} 通过 / ${fail} 失败 / model-store`);";
const block = `  // J1) jsdelivr 通道（WebLLM wasm lib）：fileUrl 取 cdnUrl 且必须 HTTPS；ensure 全量安装+深校验
  {
    const libFiles = ["a.wasm", "b.wasm"];
    const blobs = {}; for (const f of libFiles) blobs[f] = Buffer.from("WASM-" + f + "-" + "w".repeat(32));
    const files = libFiles.map((p) => ({ path: p, bytes: blobs[p].length, sha256: sha(blobs[p]), cdnUrl: "https://cdn.jsdelivr.net/x/" + p }));
    const cat = [{ id: "webllm-lib", repo: "mlc-ai/binary-mlc-llm-libs", revision: "v0_2_84-base", transport: "jsdelivr",
      dtype: "wasm", name: "t", sizeNote: "", license: { model: "Apache-2.0", url: "https://example.com" },
      files, totalBytes: files.reduce((s, f) => s + f.bytes, 0) }];
    const dir = tmp(); const store = new ModelStore(dir, { catalog: cat });
    const reqs = [];
    globalThis.fetch = async (url, init) => {
      reqs.push(String(url));
      const key = libFiles.find((f) => String(url).endsWith(f));
      const buf = blobs[key];
      const m = /bytes=(\\d+)-/.exec(init?.headers?.Range || "");
      if (m) { const from = Number(m[1]); return new Response(buf.subarray(from), { status: 206, headers: { "content-length": String(buf.length - from), "accept-ranges": "bytes" } }); }
      return new Response(buf, { status: 200, headers: { "content-length": String(buf.length), "accept-ranges": "bytes" } });
    };
    const m = store.spec("webllm-lib");
    check("jsdelivr fileUrl 为 cdnUrl 且 HTTPS", store.fileUrl(m, "a.wasm", "") === "https://cdn.jsdelivr.net/x/a.wasm");
    await store.ensure("webllm-lib", () => {});
    const v = await store.verifyActive("webllm-lib");
    check("jsdelivr 安装后深校验通过", v.ok);
    check("jsdelivr 请求走 cdn 域", reqs.every((u) => u.startsWith("https://cdn.jsdelivr.net/")));
    fs.rmSync(dir, { recursive: true, force: true });
  }

`;
if (!s.includes(anchor)) { console.error("anchor missing"); process.exit(1); }
s = s.replace(anchor, block + anchor);
fs.writeFileSync(p, s);
console.log("J1 test block inserted");
