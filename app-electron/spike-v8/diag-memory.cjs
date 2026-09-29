// Diagnostic 6: RSS vs batch chunk size (the 59-paragraph batch peaked at ~595MB RSS).
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const ENGINE = path.join(ROOT, "engine", "package", "worker");
const frozen = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "frozen-paragraphs.json"), "utf8")).paragraphs;
const wasmBinary = fs.readFileSync(path.join(ENGINE, "bergamot-translator-worker.wasm"));
const wasmRuntime = fs.readFileSync(path.join(ENGINE, "bergamot-translator-worker.js"), "utf8");
function loadBytes(rel, alignment) {
  const bytes = new Int8Array(fs.readFileSync(path.join(ROOT, rel)));
  const mem = new Module.AlignedMemory(bytes.byteLength, alignment);
  mem.getByteArrayView().set(bytes);
  return mem;
}
const config = ["beam-size: 1", "normalize: 1.0", "word-penalty: 0", "alignment: soft",
  "max-length-break: 128", "mini-batch-words: 1024", "workspace: 128", "max-length-factor: 2.0",
  "skip-cost: true", "gemm-precision: int8shiftAll", "quiet: true"].join("\n");
global.Module = { wasmBinary, onRuntimeInitialized() { main(); } };
eval.call(global, wasmRuntime);
const mb = () => +(process.memoryUsage().rss / 1048576).toFixed(1);
function tr(e, texts) {
  const input = new Module.VectorString();
  const opts = new Module.VectorResponseOptions();
  for (const t of texts) { input.push_back(t); opts.push_back({ qualityScores: false, alignment: false, html: false }); }
  const out = e.service.translate(e.model, input, opts);
  const res = [];
  for (let i = 0; i < out.size(); i++) res.push(out.get(i).getTranslatedText());
  input.delete(); opts.delete(); out.delete();
  return res;
}
function main() {
  const vocabs = new Module.AlignedMemoryList();
  vocabs.push_back(loadBytes("models/srcvocab.enzh.spm", 64));
  vocabs.push_back(loadBytes("models/trgvocab.enzh.spm", 64));
  const e = {
    service: new Module.BlockingService({ cacheSize: 0 }),
    model: new Module.TranslationModel(config, loadBytes("models/model.enzh.intgemm.alphas.bin", 256),
      loadBytes("models/lex.50.50.enzh.s2t.bin", 64), vocabs, null),
  };
  console.log("rss after load:", mb());
  const all = frozen.map((p) => p.en);
  for (const chunk of [2, 4, 8, 16]) {
    let peak = 0;
    const t = Date.now();
    for (let i = 0; i < all.length; i += chunk) {
      tr(e, all.slice(i, i + chunk));
      peak = Math.max(peak, mb());
    }
    console.log(`chunk ${chunk}: total ${Date.now() - t} ms, peak RSS ${peak} MB`);
  }
  process.exit(0);
}
