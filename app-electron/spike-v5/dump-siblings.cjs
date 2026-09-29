(async () => {
  const r = await fetch("https://hf-mirror.com/api/models/mlc-ai/Qwen2.5-3B-Instruct-q4f32_1-MLC", { headers: { "User-Agent": "node" } });
  const j = await r.json();
  console.log(JSON.stringify(j.siblings.slice(0, 4), null, 1));
})();
