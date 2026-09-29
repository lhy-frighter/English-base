// Diagnostic: translate frozen paragraphs one by one, timing each, to locate stalls and measure fallback-GEMM throughput.
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

function tr(service, model, text) {
  const input = new Module.VectorString();
  const opts = new Module.VectorResponseOptions();
  input.push_back(text); opts.push_back({ qualityScores: false, alignment: false, html: false });
  const out = service.translate(model, input, opts);
  const zh = out.get(0).getTranslatedText();
  input.delete(); opts.delete(); out.delete();
  return zh;
}

function main() {
  const t1 = Date.now();
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
  console.log(`load ${Date.now() - t1} ms`);

  const timings = [];
  const tStart = Date.now();
  for (let i = 0; i < frozen.length; i++) {
    const p = frozen[i];
    const t = Date.now();
    const zh = tr(service, model, p.en);
    const ms = Date.now() - t;
    timings.push({ id: p.id, kind: p.kind, chars: p.en.length, words: p.en.split(/\s+/).length, ms });
    console.log(`${p.id} [${p.kind}] ${p.en.length}ch ${ms}ms -> ${zh.slice(0, 40)}`);
    if (ms > 20000) { console.log(">>> slow paragraph, aborting after 3 more"); }
  }
  console.log(`total ${Date.now() - tStart} ms for ${frozen.length} paragraphs`);
  fs.writeFileSync(path.join(ROOT, "diag-timings.json"), JSON.stringify(timings, null, 2));
  process.exit(0);
}
