// S7a Bergamot worker: same lifecycle shape as a browser Web Worker (terminate == kill).
// WASM runtime is initialised ONCE; "reinit" only reloads model artifacts (re-evaling the
// Emscripten glue in the same JS context does not re-fire onRuntimeInitialized).
const fs = require("fs");
const path = require("path");
const { parentPort } = require("worker_threads");

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
const CONFIG = [
  "beam-size: 1", "normalize: 1.0", "word-penalty: 0", "alignment: soft",
  "max-length-break: 128", "mini-batch-words: 1024", "workspace: 128",
  "max-length-factor: 2.0", "skip-cost: true", "gemm-precision: int8shiftAll", "quiet: true",
].join("\n");

let engine = null; // { service, model }
let busy = false;

function buildEngine() {
  const modelMem = loadBytes("models/model.enzh.intgemm.alphas.bin", 256);
  const shortlistMem = loadBytes("models/lex.50.50.enzh.s2t.bin", 64);
  const vocabs = new Module.AlignedMemoryList();
  vocabs.push_back(loadBytes("models/srcvocab.enzh.spm", 64));
  vocabs.push_back(loadBytes("models/trgvocab.enzh.spm", 64));
  const service = new Module.BlockingService({ cacheSize: 0 });
  const model = new Module.TranslationModel(CONFIG, modelMem, shortlistMem, vocabs, null);
  return { service, model };
}

const t0 = Date.now();
global.Module = { wasmBinary, onRuntimeInitialized() { start(); } };
eval.call(global, wasmRuntime);

function start() {
  engine = buildEngine();
  parentPort.postMessage({ type: "ready", initMs: Date.now() - t0,
    rssMb: +(process.memoryUsage().rss / 1048576).toFixed(1) });
}

function translateMany(texts, html) {
  const input = new Module.VectorString();
  const opts = new Module.VectorResponseOptions();
  for (const t of texts) { input.push_back(t); opts.push_back({ qualityScores: false, alignment: false, html: !!html }); }
  const out = engine.service.translate(engine.model, input, opts);
  const res = [];
  for (let i = 0; i < out.size(); i++) res.push(out.get(i).getTranslatedText());
  input.delete(); opts.delete(); out.delete();
  return res;
}

parentPort.on("message", (msg) => {
  if (msg.type === "translate") {
    if (busy || !engine) { parentPort.postMessage({ type: "error", id: msg.id, message: "engine busy or not ready" }); return; }
    busy = true;
    try {
      const t = Date.now();
      const zh = translateMany(msg.texts, !!msg.html);
      parentPort.postMessage({ type: "result", id: msg.id, zh, ms: Date.now() - t,
        rssMb: +(process.memoryUsage().rss / 1048576).toFixed(1) });
    } catch (e) {
      parentPort.postMessage({ type: "error", id: msg.id, message: String(e && e.stack || e) });
    } finally { busy = false; }
  } else if (msg.type === "reinit") {
    try {
      engine.model.delete(); engine.service.delete();
    } catch {}
    engine = buildEngine();
    parentPort.postMessage({ type: "reinited", rssMb: +(process.memoryUsage().rss / 1048576).toFixed(1) });
  }
});
