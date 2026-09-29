const fs = require("node:fs");
const https = require("node:https");
function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "probe" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(get(res.headers.location));
      }
      let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(d));
    }).on("error", reject);
  });
}
(async () => {
  const t = JSON.parse(await get("https://api.github.com/repos/MetaGLM/glm-realtime-sdk/git/trees/main?recursive=1"));
  if (!t.tree) { console.log("BAD:", JSON.stringify(t).slice(0, 300)); return; }
  console.log(t.tree.map((x) => x.path).filter((p) => !p.startsWith("python/")).join("\n"));
})();
