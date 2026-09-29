// Render Opus outputs for review; build a genuinely randomized blind A/B pack.
// Fix vs v1: A/B IDENTITY is assigned per item by coin flip (not just display order).
// blind-key.json is written but must NOT be read before blind-votes.json is saved.
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const frozen = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "frozen-paragraphs.json"), "utf8")).paragraphs;
const opus = JSON.parse(fs.readFileSync(path.join(ROOT, "opus-result.json"), "utf8"));
const berg = JSON.parse(fs.readFileSync(path.join(ROOT, "bergamot-result.json"), "utf8"));
const oMap = new Map(opus.outputs.map((o) => [o.id, o.zh]));
const bMap = new Map(berg.outputs.map((o) => [o.id, o.zh]));
const ENGINES = { Bergamot: bMap, "Opus-MT": oMap };

let txt = "";
for (const p of frozen) txt += `【${p.id} | ${p.kind}】\nEN: ${p.en}\nZH: ${oMap.get(p.id) || ""}\n\n`;
fs.writeFileSync(path.join(ROOT, "review-opus.txt"), txt, "utf8");

// Stratified sample: every 3rd paragraph => 20 items.
const sample = frozen.filter((_, i) => i % 3 === 0);
let seed = Date.now() % 2147483648;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const key = { generatedAt: new Date().toISOString(), seed, items: {} };
let blind = "# Blind A/B pack v2 — A/B identity randomized per item. Vote into blind-votes.json BEFORE opening blind-key.json\n\n";
sample.forEach((p, i) => {
  const first = rnd() < 0.5 ? "Bergamot" : "Opus-MT";
  const second = first === "Bergamot" ? "Opus-MT" : "Bergamot";
  key.items[`item ${i + 1}`] = { paraId: p.id, kind: p.kind, A: first, B: second };
  blind += `## item ${i + 1} [${p.kind}] (${p.id})\nEN: ${p.en}\n\nA: ${ENGINES[first].get(p.id)}\n\nB: ${ENGINES[second].get(p.id)}\n\n`;
});
fs.writeFileSync(path.join(ROOT, "blind-AB.txt"), blind, "utf8");
fs.writeFileSync(path.join(ROOT, "blind-key.json"), JSON.stringify(key, null, 2), "utf8");
console.log("review-opus.txt and blind-AB.txt v2 (" + sample.length + " items, randomized identity) written");
