// Reveal: tally blind-votes.json against blind-key.json.
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const key = JSON.parse(fs.readFileSync(path.join(ROOT, "blind-key.json"), "utf8"));
const votes = JSON.parse(fs.readFileSync(path.join(ROOT, "blind-votes.json"), "utf8")).votes;
const tally = { Bergamot: 0, "Opus-MT": 0, tie: 0 };
const rows = [];
for (const [item, vote] of Object.entries(votes)) {
  const m = key.items[item];
  let engine = "tie";
  if (vote !== "tie") engine = m[vote]; // A or B -> engine name
  tally[engine]++;
  rows.push(`${item} (${m.paraId}): voted ${vote} = ${engine}`);
}
const out = { revealedAt: new Date().toISOString(), tally, rows };
fs.writeFileSync(path.join(ROOT, "blind-score.json"), JSON.stringify(out, null, 2), "utf8");
console.log(rows.join("\n"));
console.log("\nTALLY:", JSON.stringify(tally));
