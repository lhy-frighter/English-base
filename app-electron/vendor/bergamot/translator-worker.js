/*
 * 个人英语能力底座 · Bergamot 离线翻译 Worker（classic worker，随构建原样拷贝到 dist/bergamot）
 *
 * 上游：@browsermt/bergamot-translator@0.4.9（MPL-2.0，见同目录 LICENSE.txt）
 * 本文件是应用自有代码（MPL 合规：未修改任何上游产物；0.4.9 胶水已内置 createWasmGemm
 * fallback，Chromium 无 mozIntGemm 时自动走 asm 回退，无需上游 patch 脚本）。
 *
 * 设计约束（ADR-4）：
 *  - 0.4.9 的 WASM 无 pthread/SharedArrayBuffer（单线程），不依赖 crossOriginIsolated；
 *  - WASM 运行时在 Worker 内只初始化一次；请求带唯一 id、串行 busy、fatal 后整体重置；
 *  - 不在 Worker 内碰磁盘：引擎走同目录，模型走主进程给定的 app:// 只读 URL；
 *  - 对齐：0.4.9 embind 未暴露 getAlignments，但暴露 getSourceSentence/getTranslatedSentence，
 *    据此提取引擎自己分句的句对（比"自己分句再逐句翻译"保留更多上下文）。
 */

var Module = {};

var MODEL_CONFIG = [
  "beam-size: 1", "normalize: 1.0", "word-penalty: 0", "alignment: soft",
  "max-length-break: 128", "mini-batch-words: 1024", "workspace: 128",
  "max-length-factor: 2.0", "skip-cost: true", "gemm-precision: int8shiftAll",
  "quiet: true", "quiet-translation: true",
].join("\n");

var runtime = null; // { service, model, revision }
var busy = false;

function post(m) { self.postMessage(m); }
function fatal(id, err) {
  post({ type: "fatal", id: id, message: String((err && err.stack) || err) });
}

// 加载 WASM 运行时（只一次）：0.4.9 胶水内置 wasm_gemm fallback，直接 importScripts 让其自行
// fetch 同目录 .wasm 并实例化（self.location 为本 worker，与胶水同目录，相对路径可解析）
function loadRuntime() {
  return new Promise(function (resolve, reject) {
    Module.onRuntimeInitialized = function () { resolve(Module); };
    self.Module = Module;
    try {
      self.importScripts(new URL("./bergamot-translator-worker.js", self.location).href);
    } catch (e) { reject(e); }
  });
}

function alignedMemory(buffer, alignment) {
  var bytes = new Int8Array(buffer);
  var mem = new Module.AlignedMemory(bytes.byteLength, alignment);
  mem.getByteArrayView().set(bytes);
  return mem;
}

async function ensureModel(d) {
  if (runtime && runtime.revision === d.revision) return runtime;
  if (runtime) { try { runtime.model.delete(); runtime.service.delete(); } catch (e) {} runtime = null; }
  if (!Module.asm) await loadRuntime();
  var base = d.modelBase.replace(/\/+$/, "");
  async function buf(name) {
    const res = await fetch(base + "/" + name);
    if (!res.ok) throw new Error("模型文件获取失败 " + name + ": HTTP " + res.status);
    return await res.arrayBuffer();
  }
  var f = d.files;
  var modelMem = alignedMemory(await buf(f.model), 256);
  var shortlistMem = alignedMemory(await buf(f.shortlist), 64);
  var vocabs = new Module.AlignedMemoryList();
  vocabs.push_back(alignedMemory(await buf(f.srcvocab), 64));
  vocabs.push_back(alignedMemory(await buf(f.trgvocab), 64));
  var service = new Module.BlockingService({ cacheSize: 0 });
  var model = new Module.TranslationModel(MODEL_CONFIG, modelMem, shortlistMem, vocabs, null);
  runtime = { service: service, model: model, revision: d.revision };
  return runtime;
}

// 句对提取：0.4.9 未暴露对齐矩阵；getSourceSentence/getTranslatedSentence 返回 {begin,end}
// 字符区间（分别索引输入段与译文段），越界抛错，据此切片得到引擎自己分句的句对
function extractPairs(resp, srcPara, zhText) {
  var pairs = [];
  for (var j = 0; j < 256; j++) {
    try {
      var sr = resp.getSourceSentence(j);
      var tr = resp.getTranslatedSentence(j);
      if (!sr || !tr) break;
      var src = srcPara.slice(sr.begin, sr.end);
      var tgt = zhText.slice(tr.begin, tr.end);
      if (!src && !tgt) break;
      pairs.push({ src: src, tgt: tgt });
    } catch (e) { break; }
  }
  return pairs;
}

async function handleInit(d) {
  var t0 = performance.now();
  await ensureModel(d);
  post({ type: "ready", reqId: d.reqId, ms: Math.round(performance.now() - t0),
    jsHeap: memInfo(), threads: 1 });
}

async function handleTranslate(d) {
  var t0 = performance.now();
  var rt = runtime;
  if (!rt) throw new Error("翻译引擎未初始化");
  if (busy) throw new Error("引擎忙");
  busy = true;
  try {
    var input = new Module.VectorString();
    var opts = new Module.VectorResponseOptions();
    d.paras.forEach(function (p) {
      input.push_back(p);
      opts.push_back({ qualityScores: false, alignment: false, html: false });
    });
    var out = rt.service.translate(rt.model, input, opts);
    var zh = [];
    var pairsAll = [];
    for (var i = 0; i < out.size(); i++) {
      var resp = out.get(i);
      var zhText = resp.getTranslatedText();
      zh.push(zhText);
      pairsAll.push(d.withPairs ? extractPairs(resp, d.paras[i], zhText) : []);
    }
    input.delete(); opts.delete(); out.delete();
    post({ type: "result", id: d.id, ms: Math.round(performance.now() - t0),
      zh: zh, pairs: pairsAll, jsHeap: memInfo() });
  } finally { busy = false; }
}

function memInfo() {
  // Chromium 非标准 API（无 --enable-precise-memory-info 时为粗略值），仅用于闸门观测
  return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
}

self.addEventListener("message", function (ev) {
  var d = ev.data || {};
  Promise.resolve().then(async function () {
    if (d.type === "init") { await handleInit(d); return; }
    if (d.type === "translate") { await handleTranslate(d); return; }
    if (d.type === "dispose") {
      try { if (runtime) { runtime.model.delete(); runtime.service.delete(); } } catch (e) {}
      runtime = null;
      post({ type: "disposed", reqId: d.reqId });
      return;
    }
  }).catch(function (err) { fatal(d.reqId != null ? d.reqId : d.id, err); });
});
