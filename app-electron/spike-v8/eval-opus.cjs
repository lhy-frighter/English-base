// S7a Opus-MT evaluation over the same frozen 60-paragraph set, via transformers.js WASM (q8).
// Run from anywhere; resolves @huggingface/transformers from app-electron/node_modules.
const fs = require("fs");
const path = require("path");
const { env, pipeline } = require("@huggingface/transformers");

const ROOT = __dirname;
env.remoteHost = "https://hf-mirror.com";
env.allowLocalModels = false;
env.cacheDir = path.join(ROOT, "opus-cache");
// NOTE: in Node, transformers.js v3 uses onnxruntime-node (device cpu/dml); the WASM EP
// (the production target inside Electron renderer) only exists in browser builds. We use
// cpu here for the quality/size comparison; Whisper already proved the WASM renderer path
// in-app, and the ONNX graph is identical across EPs.

const frozen = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "frozen-paragraphs.json"), "utf8")).paragraphs;
const mb = () => +(process.memoryUsage().rss / 1048576).toFixed(1);

// Opus-MT context is ~512 tokens; chunk long paragraphs into sentence groups (≤200 words).
function chunkEn(text, maxWords = 200) {
  const sents = text.match(/[^.!?]+[.!…]+["'”’)\]]*|\S+/g) || [text];
  const chunks = [];
  let cur = [];
  let words = 0;
  for (const s of sents) {
    const w = s.split(/\s+/).length;
    if (words + w > maxWords && cur.length) { chunks.push(cur.join(" ")); cur = []; words = 0; }
    cur.push(s); words += w;
  }
  if (cur.length) chunks.push(cur.join(" "));
  return chunks;
}

(async () => {
  const result = { engine: "Xenova/opus-mt-en-zh q8 ONNX via @huggingface/transformers (Apache-2.0 weights)",
    startedAt: new Date().toISOString(), perf: {}, outputs: [] };

  let lastPct = -1;
  const t0 = Date.now();
  const translator = await pipeline("translation", "Xenova/opus-mt-en-zh", {
    device: "cpu", dtype: "q8",
    progress_callback(p) {
      if (p.status === "progress" && p.file) {
        const pct = Math.round(p.progress);
        if (pct !== lastPct && pct % 20 === 0) { console.log(`[dl] ${p.file}: ${pct}%`); lastPct = pct; }
      }
    },
  });
  result.perf.coldStartMs = Date.now() - t0; // includes first-time download; warm runs separate
  result.perf.rssAfterLoadMb = mb();
  console.log(`[init] pipeline ready ${result.perf.coldStartMs} ms, rss ${result.perf.rssAfterLoadMb} MB`);

  async function tr(text) {
    const chunks = chunkEn(text);
    const parts = [];
    for (const c of chunks) {
      const out = await translator(c, { max_new_tokens: 512 });
      parts.push(out[0].translation_text);
    }
    return parts.join("");
  }

  // first paragraph latency
  const tFirst = Date.now();
  const z0 = await tr(frozen[0].en);
  result.perf.firstParagraphMs = Date.now() - tFirst;
  result.outputs.push({ id: frozen[0].id, en: frozen[0].en, zh: z0 });

  // steady state, per-kind timing
  let peak = mb();
  for (const kind of ["newsinlevels", "sciencedaily", "aeon"]) {
    const paras = frozen.filter((p) => p.kind === kind);
    const words = paras.map((p) => p.en).join(" ").split(/\s+/).length;
    const t = Date.now();
    for (const p of paras) {
      if (p.id === frozen[0].id) continue;
      const zh = await tr(p.en);
      result.outputs.push({ id: p.id, en: p.en, zh });
      peak = Math.max(peak, mb());
    }
    result.perf[kind] = { paragraphs: paras.length - (kind === frozen[0].kind ? 1 : 0),
      words, ms: Date.now() - t, wordsPerSec: +(words / ((Date.now() - t) / 1000)).toFixed(1) };
    console.log(`[done] ${kind}`);
  }
  result.perf.rssPeakMb = peak;

  // newline handling + empty check
  const nl = await tr("First line of a two-line sentence.\nSecond line continues the same thought.");
  result.fidelity = { newline: { zh: nl, zhHasNewline: nl.includes("\n") },
    emptyTranslations: result.outputs.filter((o) => !o.zh.trim()).length };

  fs.writeFileSync(path.join(ROOT, "opus-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.perf, null, 2));
  process.exit(0);
})().catch((e) => { console.error("OPUS EVAL FAILED:", e); process.exit(1); });
