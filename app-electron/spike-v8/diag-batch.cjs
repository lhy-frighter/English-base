// Diagnostic 2: batch-size scaling for BlockingService.translate (eval-bergamot hung on a 59-item batch).
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
global.Module = { wasmBinary, onRuntimeInitialized() { main(); } };
eval.call(global, wasmRuntime);

function batch(service, model, texts) {
  const input = new Module.VectorString();
  const opts = new Module.VectorResponseOptions();
  for (const t of texts) { input.push_back(t); opts.push_back({ qualityScores: false, alignment: false, html: false }); }
  const t = Date.now();
  const out = service.translate(model, input, opts);
  const ms = Date.now() - t;
  const res = [];
  for (let i = 0; i < out.size(); i++) res.push(out.get(i).getTranslatedText());
  input.delete(); opts.delete(); out.delete();
  return { ms, n: res.length };
}

function main() {
  const modelMem = loadBytes("models/model.enzh.intgemm.alphas.bin", 256);
  const shortlistMem = loadBytes("models/lex.50.50.enzh.s2t.bin", 64);
  const vocabs = new Module.AlignedMemoryList();
  vocabs.push_back(loadBytes("models/srcvocab.enzh.spm", 64));
  vocabs.push_back(loadBytes("models/trgvocab.enzh.spm", 64));
  const config = ["beam-size: 1", "normalize: 1.0", "word-penalty: 0", "alignment: soft",
    "max-length-break: 128", "mini-batch-words: 1024", "workspace: 128", "max-length-factor: 2.0",
    "skip-cost: true", "gemm-precision: int8shiftAll", "quiet: true"].join("\n");
  const service = new Module.BlockingService({ cacheSize: 0 });
  const model = new Module.TranslationModel(config, modelMem, shortlistMem, vocabs, null);

  const all = frozen.map((p) => p.en);
  for (const n of [1, 5, 10, 20, 40, 59]) {
    const r = batch(service, model, all.slice(0, n));
    console.log(`batch ${n}: ${r.ms} ms`);
    global.gc && global.gc();
  }
  process.exit(0);
}
