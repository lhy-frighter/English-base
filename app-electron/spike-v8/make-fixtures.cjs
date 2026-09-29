// S7a: build the frozen 60-paragraph evaluation set (20 each: NewsInLevels / ScienceDaily / Aeon).
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { extractReadable } = require("../url-extract.cjs");

const OUT = path.join(__dirname, "fixtures");
fs.mkdirSync(OUT, { recursive: true });

function pickParas(text, want = 20, minLen = 50, maxLen = 900) {
  let paras = text
    .split(/\n{1,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= minLen && s.length <= maxLen && !/^[\d\s.,;:"'“”‘’\-–—()\[\]]+$/.test(s))
    // drop obvious headings / bylines / captions
    .filter((s) => !/^(by |photograph|illustration|source:|credit:)/i.test(s));
  // dedupe
  paras = [...new Set(paras)];
  if (paras.length <= want) return paras;
  // evenly spread across the article
  const step = paras.length / want;
  const out = [];
  for (let i = 0; i < want; i++) out.push(paras[Math.floor(i * step)]);
  return out;
}

async function main() {
  const db = new DatabaseSync(path.join(__dirname, "..", "data", "user.sqlite"), { readOnly: true });
  const sets = [];

  const sd = db.prepare("SELECT title,raw_text FROM texts WHERE id=8").get();
  const ae = db.prepare("SELECT title,raw_text FROM texts WHERE id=6").get();

  const add = (source, kind, title, url, paras) => {
    paras.forEach((en, i) => sets.push({ id: `${kind}-${String(i + 1).padStart(2, "0")}`, source, kind, title, url, paraIndex: i, en }));
  };

  add("ScienceDaily", "sciencedaily", sd.title, "imported in user library (ScienceDaily RSS, 2026-09-17)", pickParas(sd.raw_text, 20, 50, 1400));
  add("Aeon", "aeon", ae.title, "imported in user library (Aeon RSS)", pickParas(ae.raw_text, 20, 50, 1400));

  // News in Levels — single stories are short (~18 short paras), so freeze 10 paras from two L2 stories
  const nilStories = [
    "https://www.newsinlevels.com/products/englands-tourist-tax-level-2/",
    "https://www.newsinlevels.com/products/a-czech-man-changes-the-world-of-3d-printing-level-2/",
  ];
  let nilParas = [];
  for (const u of nilStories) {
    const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EnglishBase/1.0" } });
    if (!res.ok) throw new Error(`NIL fetch HTTP ${res.status} ${u}`);
    const ex = extractReadable(await res.text(), u);
    console.log("NIL extracted:", ex.title, "| chars:", ex.chars);
    nilParas = nilParas.concat(pickParas(ex.text, 10, 30, 700));
  }
  add("News in Levels (L2)", "newsinlevels", "England's tourist tax / A Czech man changes 3D printing (two L2 stories)", nilStories.join(" "), nilParas);

  db.close();

  const byKind = {};
  for (const s of sets) byKind[s.kind] = (byKind[s.kind] || 0) + 1;
  if (Object.values(byKind).some((n) => n < 20)) {
    console.error("not enough paragraphs:", byKind);
    process.exit(1);
  }
  fs.writeFileSync(path.join(OUT, "frozen-paragraphs.json"), JSON.stringify({
    frozenAt: new Date().toISOString(),
    note: "S7a Bergamot/Opus-MT blind evaluation set; do not swap samples after evaluation starts",
    counts: byKind,
    paragraphs: sets,
  }, null, 2));
  console.log("frozen set written:", byKind);
}
main().catch((e) => { console.error(e); process.exit(1); });
