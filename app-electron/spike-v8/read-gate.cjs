const fs = require("fs");
const path = require("path");
const dir = path.join(process.cwd(), "spike-v8");
for (const f of ["gate-renderer-iso.json", "gate-renderer-noiso.json"]) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.log(f, "MISSING"); continue; }
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const wps = Math.round(j.batch2.words / (j.batch2.ms / 1000));
  console.log("==", f);
  console.log("isolated", j.isolated, "sab", j.sab, "init", j.initMs, "first", j.firstMs,
    "batch2", j.batch2.ms, "ms", j.batch2.words, "words", wps, "wps empty", j.batch2.empty);
  console.log("rss", JSON.stringify(j.rss));
  console.log("pairs", j.pairChecks.map(c => `${c.npairs}/${c.srcCover}/${c.tgtCover}/${c.tgtAllNonEmpty}`).join(" "));
}
