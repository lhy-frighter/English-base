(async () => {
  const url = "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/v0_2_84/base/Qwen2.5-3B-Instruct-q4f32_1_cs1k-webgpu.wasm";
  try {
    const r = await fetch(url, { headers: { "User-Agent": "english-base-electron" } });
    console.log("status", r.status, "type", r.headers.get("content-type"), "len", r.headers.get("content-length"));
    const b = await r.arrayBuffer();
    console.log("bytes", b.byteLength, "magic", Buffer.from(b.slice(0, 4)).toString("hex"));
  } catch (e) { console.log("err", e.message); }
})();
