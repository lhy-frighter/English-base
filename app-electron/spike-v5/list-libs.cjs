(async () => {
  try {
    const r = await fetch("https://api.github.com/repos/mlc-ai/binary-mlc-llm-libs/contents/web-llm-models/v0_2_84/base", {
      headers: { "User-Agent": "node" },
    });
    if (!r.ok) { console.log("http", r.status); return; }
    const j = await r.json();
    j.filter((x) => /Qwen2\.5-(1\.5B|3B)/.test(x.name)).forEach((x) => console.log(x.name, Math.round(x.size / 1e6) + "MB"));
  } catch (e) { console.log("err", e.message); }
})();
