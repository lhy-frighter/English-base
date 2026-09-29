// 临时：Attention 论文标注基线（S1 后），用完即删
const path = require("node:path");
const { Core } = require("../core.cjs");
const core = new Core(path.join(__dirname, "..", "data"));
const row = core.user.prepare("SELECT id,title,raw_text FROM texts WHERE title LIKE '%Attention%' OR raw_text LIKE '%Attention Is All You Need%' ORDER BY id LIMIT 1").get();
if (!row) { console.log("未找到 Attention 文章"); process.exit(0); }
const toks = core.annotate(row.raw_text).filter((t) => t.label !== "punct");
const tally = {};
for (const t of toks) tally[t.label] = (tally[t.label] || 0) + 1;
console.log("文章:", row.title, " 词数:", toks.length);
console.log("分布:", tally);
const uniq = new Map();
for (const t of toks) if (t.label === "miss" || t.label === "proper") {
  const k = t.text.toLowerCase();
  uniq.set(k, (uniq.get(k) || 0) + 1);
}
const arr = [...uniq.entries()].sort((a, b) => b[1] - a[1]);
console.log("\nmiss/proper 去重后共", arr.length, "个；Top 60：");
console.log(arr.slice(0, 60).map(([w, n]) => `${w}(${n})`).join(" "));
core.user.close();
