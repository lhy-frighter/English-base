(async () => {
  const repos = ["mlc-ai/Qwen2.5-3B-Instruct-q4f32_1-MLC", "mlc-ai/Qwen2.5-1.5B-Instruct-q4f32_1-MLC"];
  for (const repo of repos) {
    const meta = await (await fetch("https://hf-mirror.com/api/models/" + repo, { headers: { "User-Agent": "node" } })).json();
    const sha = meta.sha;
    const tree = await (await fetch(`https://hf-mirror.com/api/models/${repo}/tree/${sha}?recursive=true`, { headers: { "User-Agent": "node" } })).json();
    console.log("REPO|" + repo + "|sha|" + sha);
    for (const t of tree) {
      if (t.type === "file") console.log(`FILE|${t.path}|${t.size}|${t.lfs ? "LFS" : ""}`);
    }
  }
})();
