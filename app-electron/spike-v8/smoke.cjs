// S7a smoke: run the production Firefox en->zh base-memory model under @browsermt/bergamot-translator 0.4.9 (Node).
// Usage: node smoke.cjs
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const ENGINE = path.join(ROOT, "engine", "package", "worker");

const t0 = Date.now();
const wasmBinary = fs.readFileSync(path.join(ENGINE, "bergamot-translator-worker.wasm"));
const wasmRuntime = fs.readFileSync(path.join(ENGINE, "bergamot-translator-worker.js"), "utf8");

function loadBytes(rel, alignment) {
  const bytes = new Int8Array(fs.readFileSync(path.join(ROOT, rel)));
  const mem = new Module.AlignedMemory(bytes.byteLength, alignment);
  mem.getByteArrayView().set(bytes);
  return mem;
}

global.Module = { wasmBinary, onRuntimeInitialized };
eval.call(global, wasmRuntime);

async function onRuntimeInitialized() {
  const tWasm = Date.now() - t0;
  console.log(`[init] wasm runtime ready in ${tWasm} ms`);

  const t1 = Date.now();
  const modelMem = loadBytes("models/model.enzh.intgemm.alphas.bin", 256);
  const shortlistMem = loadBytes("models/lex.50.50.enzh.s2t.bin", 64);
  const srcVocabMem = loadBytes("models/srcvocab.enzh.spm", 64);
  const trgVocabMem = loadBytes("models/trgvocab.enzh.spm", 64);
  const vocabs = new Module.AlignedMemoryList();
  vocabs.push_back(srcVocabMem);
  vocabs.push_back(trgVocabMem);

  const config = [
    "beam-size: 1",
    "normalize: 1.0",
    "word-penalty: 0",
    "alignment: soft",
    "max-length-break: 128",
    "mini-batch-words: 1024",
    "workspace: 128",
    "max-length-factor: 2.0",
    "skip-cost: true",
    "gemm-precision: int8shiftAll",
    "quiet: true",
  ].join("\n");

  const service = new Module.BlockingService({ cacheSize: 0 });
  const model = new Module.TranslationModel(config, modelMem, shortlistMem, vocabs, null);
  console.log(`[init] model loaded in ${Date.now() - t1} ms`);

  const cases = [
    { html: false, text: "Hello world. This is a quick offline translation test." },
    { html: true, text: "<p>A remarkably preserved <b>fossil</b> from northeastern Spain is giving scientists a rare look at the skin of an ancient crocodile relative that lived about 125 million years ago.</p>" },
    { html: false, text: "The transformer architecture relies entirely on self-attention mechanisms, dispensing with recurrence and convolutions entirely." },
  ];

  const input = new Module.VectorString();
  const opts = new Module.VectorResponseOptions();
  for (const c of cases) { input.push_back(c.text); opts.push_back({ qualityScores: false, alignment: false, html: c.html }); }

  const t2 = Date.now();
  const out = service.translate(model, input, opts);
  const dt = Date.now() - t2;
  for (let i = 0; i < out.size(); i++) {
    console.log(`\n--- case ${i + 1} ---`);
    console.log("EN:", cases[i].text);
    console.log("ZH:", out.get(i).getTranslatedText());
  }
  console.log(`\n[perf] first batch (${cases.length} inputs) translate time ${dt} ms`);

  input.delete(); opts.delete(); out.delete(); model.delete(); service.delete();
  process.exit(0);
}
