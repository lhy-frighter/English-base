// 审计：buildCloze 在真实语料上的 miss 率与错挖率；annotate miss 分类
const { Core, buildCloze } = require("../core.cjs");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { extractText } = require("../import-tools.cjs");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cloze-"));
  const core = new Core(dir);
  const corpus = [];
  for (const b of core.builtins) corpus.push(["builtin:" + b.id, b.text]);
  const FIX = path.join(__dirname, "..", "test-fixtures", "pdf");
  for (const f of ["attention.pdf", "instructgpt.pdf", "vae.pdf"]) {
    try { const { text } = await extractText(path.join(FIX, f)); corpus.push(["pdf:" + f, text]); }
    catch (e) { console.log("pdf skip", f, e.message); }
  }

  let total = 0, miss = 0, wrong = 0;
  const missEx = [], wrongEx = [];
  const missLabels = {};
  for (const [src, text] of corpus) {
    const ann = core.annotate(text);
    // miss 分类
    for (const t of ann) {
      if (t.label === "miss") { missLabels[src] = (missLabels[src] || 0) + 1; }
    }
    // 按句聚合：对句中可解析的内容词建挖空
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const sent of sentences) {
      if (sent.length < 20 || sent.length > 300) continue;
      const toks = core.annotate(sent).filter((t) => ["word", "word_lemma", "cap_word"].includes(t.label));
      const lemmas = new Set();
      for (const t of toks) {
        const lem = core.canonical(t.text.toLowerCase().replace(/[’']s$/, ""));
        if (!lem || lem.length < 5) continue;
        const d = core.user.prepare("SELECT pos,translation FROM dict.words WHERE word=?").get(lem);
        if (!d) continue;
        const firstLine = (d.translation || "").split("\\n")[0];
        if (/^\s*(art|prep|conj|pron|num|aux|det)\./i.test(firstLine)) continue;
        lemmas.add(lem);
      }
      for (const lem of lemmas) {
        total++;
        const cl = buildCloze(core, sent, lem);
        if (cl.miss) { miss++; if (missEx.length < 12) missEx.push(`[${src}] ${lem} :: ${sent.slice(0, 90)}`); continue; }
        // 校验挖掉的答案确实是该 lemma 的形态
        const ansWords = cl.answer.toLowerCase().split(/[^a-z'’-]+/).filter(Boolean);
        const ok = ansWords.some((w) => { const l = core.canonical(w.replace(/[’']s$/, "")); return l === lem; });
        if (!ok) { wrong++; if (wrongEx.length < 12) wrongEx.push(`[${src}] ${lem} => "${cl.answer}" :: ${sent.slice(0, 90)}`); }
      }
    }
  }
  console.log("挖空样本", total, "miss", miss, ((miss / total) * 100).toFixed(1) + "%", "错挖", wrong, ((wrong / total) * 100).toFixed(2) + "%");
  console.log("-- miss 例 --\n" + missEx.join("\n"));
  console.log("-- 错挖例 --\n" + wrongEx.join("\n"));
  console.log("-- annotate miss 计数 --", JSON.stringify(missLabels));
  core.user.close();
  fs.rmSync(dir, { recursive: true, force: true });
})();
