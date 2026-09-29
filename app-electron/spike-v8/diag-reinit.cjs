// Diagnostic 3: does delete()+rebuild (reinit) work in one WASM runtime?
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const ENGINE = path.join(ROOT, "engine", "package", "worker");
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

function build() {
  const modelMem = loadBytes("models/model.enzh.intgemm.alphas.bin", 256);
  const shortlistMem = loadBytes("models/lex.50.50.enzh.s2t.bin", 64);
  const vocabs = new Module.AlignedMemoryList();
  vocabs.push_back(loadBytes("models/srcvocab.enzh.spm", 64));
  vocabs.push_back(loadBytes("models/trgvocab.enzh.spm", 64));
  const service = new Module.BlockingService({ cacheSize: 0 });
  const model = new Module.TranslationModel(config, modelMem, shortlistMem, vocabs, null);
  return { service, model };
}
function tr(engine, text) {
  const input = new Module.VectorString();
  const opts = new Module.VectorResponseOptions();
  input.push_back(text); opts.push_back({ qualityScores: false, alignment: false, html: false });
  const out = engine.service.translate(engine.model, input, opts);
  const zh = out.get(0).getTranslatedText();
  input.delete(); opts.delete(); out.delete();
  return zh;
}
function main() {
  let e = build();
  console.log("v1:", tr(e, "Reinitialization test sentence."));
  e.model.delete(); e.service.delete();
  console.log("deleted, rebuilding...");
  e = build();
  console.log("v2:", tr(e, "Reinitialization test sentence."));
  process.exit(0);
}
