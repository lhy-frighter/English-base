// 二刷审计 D：三份冻结 PDF 抽取文本的 miss 分类
// 区分：① PDF 抽取损坏（含非字母/连字符断裂）② canonical 能救但漏了 ③ 真词典未收录
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { extractText } = require("../import-tools.cjs");
const { Core } = require("../core.cjs");
const { DatabaseSync } = require("node:sqlite");

const FIX = path.join(__dirname, "..", "test-fixtures", "pdf");
const dict = new DatabaseSync(path.join(__dirname, "..", "data", "dict.sqlite"));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "diagpdf-"));
  const core = new Core(dir);
  for (const f of ["attention.pdf", "instructgpt.pdf", "vae.pdf"]) {
    const { text } = await extractText(path.join(FIX, f));
    const toks = core.annotate(text);
    const miss = toks.filter((t) => t.label === "miss");
    const buckets = { broken: [], hyphen: [], canonicalCould: [], realOov: [], properMaybe: [] };
    for (const t of miss) {
      const w = t.text;
      // 抽取损坏：含奇怪字符、单字母碎片、数字粘连
      if (/[^A-Za-z'’-]/.test(w) || w.length < 2) { buckets.broken.push(w); continue; }
      if (w.includes("-")) { buckets.hyphen.push(w); continue; }
      const low = w.toLowerCase();
      const can = core.canonical(low);
      const row = can && can !== low ? dict.prepare("SELECT frq,tag FROM words WHERE word=?").get(can) : null;
      if (row) { buckets.canonicalCould.push(`${w}->${can}(frq${row.frq})`); continue; }
      // 大写且像专名
      if (/^[A-Z]/.test(w) && /[A-Z]/.test(t.text.slice(1)) === false) { buckets.properMaybe.push(w); continue; }
      buckets.realOov.push(w);
    }
    const uniq = (arr) => [...new Set(arr)];
    console.log(`\n=== ${f}：miss token=${miss.length}，去重 ${uniq(miss.map((t) => t.text)).length} ===`);
    console.log(`broken ${uniq(buckets.broken).length}:`, uniq(buckets.broken).slice(0, 15).join(" "));
    console.log(`hyphen ${uniq(buckets.hyphen).length}:`, uniq(buckets.hyphen).slice(0, 15).join(" "));
    console.log(`canonical 可救 ${buckets.canonicalCould.length}:`, uniq(buckets.canonicalCould).slice(0, 25).join(" "));
    console.log(`疑似专名 ${uniq(buckets.properMaybe).length}:`, uniq(buckets.properMaybe).slice(0, 15).join(" "));
    console.log(`真 OOV(非专名) ${uniq(buckets.realOov).length}:`, uniq(buckets.realOov).slice(0, 25).join(" "));
  }
  core.user.close();
  fs.rmSync(dir, { recursive: true, force: true });
  dict.close();
})();
