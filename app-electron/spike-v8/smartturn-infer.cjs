// S13-0a step3: onnxruntime-node 推理 + 指标统计（CPU, int8 模型）
const path = require("path");
const fs = require("fs");
const { createRequire } = require("module");

const ROOT = __dirname;
const ortPkg = path.join(
  ROOT, "..", "node_modules", ".pnpm", "onnxruntime-node@1.24.3",
  "node_modules", "onnxruntime-node");
const requireOrt = createRequire(path.join(ortPkg, "dist", "index.js"));
const ort = requireOrt(path.join(ortPkg, "dist", "index.js"));

const MODEL = path.join(ROOT, "..", "vendor", "smart-turn", "smart-turn-v3.2-cpu.onnx");
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "smartturn-meta.json"), "utf8"));

function metrics(items, label) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const it of items) {
    const pred = it.prob > 0.5;
    if (pred && it.endpoint) tp++;
    else if (pred && !it.endpoint) fp++;
    else if (!pred && !it.endpoint) tn++;
    else fn++;
  }
  const n = items.length;
  const acc = n ? (tp + tn) / n : 0;
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const rec = tp + fn ? tp / (tp + fn) : 0;
  const f1 = prec + rec ? 2 * prec * rec / (prec + rec) : 0;
  return { label, n, acc: pct(acc), precision: pct(prec), recall: pct(rec),
    f1: pct(f1), FPR: pct(fp / (fp + tn || 1)), FNR: pct(fn / (fn + tp || 1)),
    tp, fp, tn, fn };
}
const pct = (x) => Math.round(x * 10000) / 100;

async function main() {
  const so = { executionMode: "sequential", interOpNumThreads: 1,
    graphOptimizationLevel: "all" };
  const session = await ort.InferenceSession.create(MODEL, so);
  console.log("inputs:", session.inputNames, "outputs:", session.outputNames);

  const results = [];
  const timings = [];
  for (const m of meta) {
    const buf = fs.readFileSync(path.join(ROOT, "smartturn-feats", m.feat));
    const f32 = new Float32Array(buf.buffer, buf.byteOffset,
      buf.byteLength / 4);
    const tensor = new ort.Tensor("float32", Float32Array.from(f32), [1, 80, 800]);
    const t0 = process.hrtime.bigint();
    const out = await session.run({ input_features: tensor });
    timings.push(Number(process.hrtime.bigint() - t0) / 1e6);
    const name = session.outputNames[0];
    const o = out[name];
    let prob = o.data[0];
    if (o.dims.length > 1 || o.data.length > 1) {
      // 兼容 [1,1] / logits 两种形态
      prob = o.data[o.data.length - 1];
    }
    results.push({ ...m, prob });
  }
  timings.sort((a, b) => a - b);
  const p = (q) => timings[Math.min(timings.length - 1, Math.floor(timings.length * q))];
  const lat = { avg: Math.round(timings.reduce((a, b) => a + b, 0) / timings.length),
    p50: Math.round(p(0.5)), p95: Math.round(p(0.95)), max: Math.round(timings.at(-1)) };

  const groups = {};
  for (const r of results) {
    (groups[r.language] ||= []).push(r);
  }
  const report = {
    overall: metrics(results, "overall"),
    byLanguage: Object.entries(groups).map(([lang, items]) => metrics(items, lang)),
    latency_ms: lat,
    errors: results.filter((r) => (r.prob > 0.5) !== r.endpoint)
      .map((r) => ({ file: r.file, lang: r.language, endpoint: r.endpoint,
        prob: Math.round(r.prob * 1000) / 1000, text: String(r.spoken_text).slice(0, 80) })),
  };
  fs.writeFileSync(path.join(ROOT, "smartturn-result.json"),
    JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.overall));
  for (const g of report.byLanguage) console.log(JSON.stringify(g));
  console.log("latency", JSON.stringify(lat));
  console.log("errors:", report.errors.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
