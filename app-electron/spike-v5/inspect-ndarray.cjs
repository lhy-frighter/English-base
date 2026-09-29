(async () => {
  const base = "https://hf-mirror.com/mlc-ai/Qwen2.5-3B-Instruct-q4f32_1-MLC/resolve/dfa91e859b714acfa489a1464297080656c3460d/";
  const r = await fetch(base + "ndarray-cache.json", { headers: { "User-Agent": "node" } });
  const j = await r.json();
  console.log("keys", Object.keys(j), "n", j.records.length);
  console.log(JSON.stringify(j.records[0]).slice(0, 300));
  console.log("last", JSON.stringify(j.records[j.records.length - 1]).slice(0, 200));
})();
