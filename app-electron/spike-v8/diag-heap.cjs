// Diagnostic 7: distinguish Emscripten/WASM heap growth from leaked JS memory.
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
const heapMb = () => Module.HEAP8 && Module.HEAP8.buffer ? +(Module.HEAP8.buffer.byteLength / 1048576).toFixed(1) : null;
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
  console.log("after load: rss", mb(), "wasm heap", heapMb());
  tr(e, [frozen[0].en]);
  console.log("after 1 para: rss", mb(), "wasm heap", heapMb());
  for (let i = 0; i < 20; i++) tr(e, [frozen[i + 1].en]);
  console.log("after 20 paras: rss", mb(), "wasm heap", heapMb());
  for (let i = 20; i < 60; i++) tr(e, [frozen[i].en]);
  console.log("after 60 paras: rss", mb(), "wasm heap", heapMb());
  global.gc();
  console.log("after gc: rss", mb(), "wasm heap", heapMb());
  process.exit(0);
}
