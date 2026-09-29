// Diagnostic 8: sweep marian config knobs to see what drives the 687MB WASM heap.
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
const mb = () => +(process.memoryUsage().rss / 1048576).toFixed(1);
const heapMb = () => +(Module.HEAP8.buffer.byteLength / 1048576).toFixed(1);

function run(cfgLines, label) {
  const vocabs = new Module.AlignedMemoryList();
  vocabs.push_back(loadBytes("models/srcvocab.enzh.spm", 64));
  vocabs.push_back(loadBytes("models/trgvocab.enzh.spm", 64));
  const service = new Module.BlockingService({ cacheSize: 0 });
  const model = new Module.TranslationModel(cfgLines.join("\n"),
    loadBytes("models/model.enzh.intgemm.alphas.bin", 256), loadBytes("models/lex.50.50.enzh.s2t.bin", 64), vocabs, null);
  const input = new Module.VectorString();
  const opts = new Module.VectorResponseOptions();
  input.push_back(frozen[0].en); opts.push_back({ qualityScores: false, alignment: false, html: false });
  const t = Date.now();
  const out = service.translate(model, input, opts);
  const zh = out.get(0).getTranslatedText();
  const ms = Date.now() - t;
  console.log(`${label}: rss ${mb()} heap ${heapMb()} firstPara ${ms}ms | ${zh.slice(0, 30)}`);
  input.delete(); opts.delete(); out.delete(); model.delete(); service.delete();
  global.gc();
}
function main() {
  const base = ["beam-size: 1", "normalize: 1.0", "word-penalty: 0", "alignment: soft",
    "max-length-break: 128", "mini-batch-words: 1024", "skip-cost: true",
    "gemm-precision: int8shiftAll", "quiet: true"];
  const variants = [
    ["baseline ws128 ", base.concat("workspace: 128")],
    ["ws32          ", base.concat("workspace: 32")],
    ["ws16          ", base.concat("workspace: 16")],
    ["ws32 mb256    ", base.concat("workspace: 32", "mini-batch-words: 256")],
    ["ws32 mb128 ml64", base.concat("workspace: 32", "mini-batch-words: 128", "max-length-break: 64")],
  ];
  const idx = process.argv[2] ? +process.argv[2] : 0;
  const [label, cfg] = variants[idx];
  run(cfg, label);
  process.exit(0);
}
