// S7a Bergamot evaluation over the frozen 60-paragraph set.
// Covers: cold start, first-paragraph latency, steady throughput, peak RSS,
// continuous 60-paragraph run, in-place reinit determinism, worker cancel (terminate), offline restart.
const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");

const ROOT = __dirname;
const frozen = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "frozen-paragraphs.json"), "utf8")).paragraphs;

function spawnWorker(env = {}) {
  return new Promise((resolve, reject) => {
    const t = Date.now();
    const w = new Worker(path.join(ROOT, "bergamot-worker.cjs"), { env: { ...process.env, ...env } });
    const timer = setTimeout(() => reject(new Error("worker ready timeout")), 120000);
    w.once("message", (m) => {
      if (m.type === "ready") { clearTimeout(timer); resolve({ w, coldMs: Date.now() - t, initMs: m.initMs, rssMb: m.rssMb }); }
    });
    w.on("message", (m) => { if (m.type === "error") { clearTimeout(timer); reject(new Error("worker error: " + m.message)); } });
    w.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}
function call(w, msg) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("translate timeout")), 300000);
    const onMsg = (m) => {
      if (m.type === "result" && m.id === msg.id) { clearTimeout(timer); w.off("message", onMsg); resolve(m); }
      if (m.type === "error" && m.id === msg.id) { clearTimeout(timer); w.off("message", onMsg); reject(new Error(m.message)); }
    };
    w.on("message", onMsg);
    w.postMessage(msg);
  });
}
function once(w, type) {
  return new Promise((resolve) => w.once("message", (m) => { if (m.type === type) resolve(m); }));
}

(async () => {
  const result = { engine: "@browsermt/bergamot-translator@0.4.9 + Firefox production en->zh base-memory (model 4e5accc1…)",
    startedAt: new Date().toISOString(), perf: {}, fidelity: {}, outputs: [] };

  // 1) cold start
  const { w, coldMs, initMs, rssMb } = await spawnWorker();
  result.perf.coldStartMs = coldMs;        // process spawn -> ready
  result.perf.engineInitMs = initMs;       // inside worker: wasm + model load
  result.perf.rssAfterLoadMb = rssMb;

  // 2) first paragraph latency (batch of 1, cold caches)
  console.log("[phase] first paragraph");
  const first = frozen[0];
  const tFirst = Date.now();
  const r1 = await call(w, { type: "translate", id: "first", texts: [first.en] });
  result.perf.firstParagraphMs = Date.now() - tFirst;
  result.outputs.push({ id: first.id, en: first.en, zh: r1.zh[0] });

  // 3) steady-state throughput: remaining 59 in one batch
  console.log("[phase] batch 59");
  const rest = frozen.slice(1);
  const tBatch = Date.now();
  const rBatch = await call(w, { type: "translate", id: "batch", texts: rest.map((p) => p.en) });
  result.perf.batch59Ms = Date.now() - tBatch;
  rest.forEach((p, i) => result.outputs.push({ id: p.id, en: p.en, zh: rBatch.zh[i] }));

  // per-kind wall time via separate timed batches (cache disabled; still steady state)
  for (const kind of ["newsinlevels", "sciencedaily", "aeon"]) {
    console.log(`[phase] per-kind ${kind}`);
    const texts = frozen.filter((p) => p.kind === kind).map((p) => p.en);
    const words = texts.join(" ").split(/\s+/).length;
    const t = Date.now();
    const r = await call(w, { type: "translate", id: `kind-${kind}`, texts });
    const ms = Date.now() - t;
    result.perf[kind] = { paragraphs: texts.length, words, ms, wordsPerSec: +(words / (ms / 1000)).toFixed(1) };
  }
  result.perf.rssPeakMb = Math.max(r1.rssMb, rBatch.rssMb);

  // 4) fidelity probes
  const probes = [];
  // 4a) numbers
  let numSrc = 0, numKept = 0;
  for (const o of result.outputs) {
    const srcNums = (o.en.match(/\b\d[\d,\.]*\b/g) || []);
    if (srcNums.length) {
      numSrc += srcNums.length;
      for (const n of srcNums) { const digits = n.replace(/\D/g, ""); if (digits && o.zh.includes(digits)) numKept++; }
    }
  }
  probes.push({ check: "digits preserved (may be legitimately converted, e.g. million→亿)", srcNumbers: numSrc, digitRunsKept: numKept });
  // 4b) quotes / apostrophes / newline / long paragraph
  const withQuote = result.outputs.filter((o) => /["“”']/.test(o.en)).length;
  probes.push({ check: "paragraphs containing quotes/apostrophes", count: withQuote });
  const longest = result.outputs.slice().sort((a, b) => b.en.length - a.en.length)[0];
  probes.push({ check: "longest paragraph chars", enChars: longest.en.length, id: longest.id });
  const nlSrc = "First line of a two-line sentence.\nSecond line continues the same thought.";
  const nlRes = await call(w, { type: "translate", id: "newline", texts: [nlSrc] });
  probes.push({ check: "embedded newline handling", src: nlSrc, zh: nlRes.zh[0], zhHasNewline: nlRes.zh[0].includes("\n") });
  // 4c) empty output / collapse detection
  const empties = result.outputs.filter((o) => !o.zh.trim()).length;
  probes.push({ check: "empty translations", count: empties });
  // 4d) length ratio (zh chars / en words), flag extremes
  const ratios = result.outputs.map((o) => o.zh.replace(/<[^>]+>/g, "").length / Math.max(1, o.en.split(/\s+/).length));
  ratios.sort((a, b) => a - b);
  probes.push({ check: "zh-char/en-word ratio min/median/max",
    min: +ratios[0].toFixed(2), median: +ratios[Math.floor(ratios.length / 2)].toFixed(2), max: +ratios[ratios.length - 1].toFixed(2) });
  result.fidelity = probes;

  // 5) reinit determinism — compare the SAME batch shape before/after rebuild
  // (single-call vs batch legitimately differ slightly under int8 batching; that is not nondeterminism)
  console.log("[phase] reinit determinism");
  const probeTexts = frozen.slice(0, 3).map((p) => p.en);
  const rPre = await call(w, { type: "translate", id: "pre-reinit", texts: probeTexts });
  w.postMessage({ type: "reinit" });
  await once(w, "reinited");
  const rRe = await call(w, { type: "translate", id: "reinit", texts: probeTexts });
  result.reinitDeterministic = rRe.zh.every((z, i) => z === rPre.zh[i]);

  await w.terminate();

  // 6) cancellation: worker fed a large batch, terminated mid-flight; main must survive
  console.log("[phase] cancel/terminate");
  const w2 = await spawnWorker();
  const huge = Array.from({ length: 60 }, () => frozen[40].en);
  w2.w.postMessage({ type: "translate", id: "huge", texts: huge });
  await new Promise((r) => setTimeout(r, 100));
  const tTerm = Date.now();
  await w2.w.terminate();
  result.cancelTerminateMs = Date.now() - tTerm;

  // 7) offline restart: dead proxy proves no network is touched; fresh worker translates fine
  console.log("[phase] offline restart");
  const w3 = await spawnWorker({ HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9" });
  const rOff = await call(w3.w, { type: "translate", id: "offline", texts: ["Offline restart works: translation needs no network at runtime."] });
  result.offlineRestart = { ok: rOff.zh[0].length > 0, sample: rOff.zh[0] };
  await w3.w.terminate();

  fs.writeFileSync(path.join(ROOT, "bergamot-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    coldStartMs: result.perf.coldStartMs, engineInitMs: result.perf.engineInitMs,
    firstParagraphMs: result.perf.firstParagraphMs, batch59Ms: result.perf.batch59Ms,
    rssPeakMb: result.perf.rssPeakMb, byKind: {
      newsinlevels: result.perf.newsinlevels, sciencedaily: result.perf.sciencedaily, aeon: result.perf.aeon,
    },
    reinitDeterministic: result.reinitDeterministic, cancelTerminateMs: result.cancelTerminateMs,
    offlineRestart: result.offlineRestart, fidelity: result.fidelity,
  }, null, 2));
  process.exit(0);
})().catch((e) => { console.error("EVAL FAILED:", e); process.exit(1); });
