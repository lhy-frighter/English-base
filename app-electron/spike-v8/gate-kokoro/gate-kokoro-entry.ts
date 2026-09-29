// S7c 闸门页面：Worker 编排、指标采集、WAV 导出、30 分钟浸泡。
// URL 参数：?soak=1800（默认；0=跳过浸泡，用于快速冒烟）&threads=2
const params = new URLSearchParams(location.search);
const SOAK_SEC = Number(params.get("soak") ?? "1800");
const THREADS = Number(params.get("threads") ?? "8");
const SR = 24000;

const SENTENCES = [
  "Dr. Smith published 3.14 pages in the U.S. in 2024, earning 1,000 citations.",
  "Attention mechanisms, unlike recurrent networks, allow parallel computation across tokens.",
  "The transformer architecture relies on multi-head self-attention and positional encodings.",
  "Gradient descent converges when the learning rate, e.g. 0.001, is small enough.",
  "Satoshi Nakamoto's identity remains unknown; however, the blockchain persists.",
  "The quokka, a small marsupial, lives on Rottnest Island.",
  "We propose a novel isomorphism between the two algebraic structures.",
  "Convolutional neural networks extract local features before global pooling.",
  "Mr. O'Brien invested $2,500.50 in March, i.e. nearly everything he had.",
  "Entropy measures uncertainty; cross-entropy, by contrast, compares distributions.",
  "The zorpalod quivered in the flibbertigibbet's garden.",
  "Wait — you mean she actually finished the dissertation? Really?",
  "Backpropagation computes gradients via the chain rule, layer by layer.",
  "The experiment ran from 9:15 a.m. to 3:45 p.m., with 1,200 participants.",
  "This thesis investigates phonotactic constraints in second-language acquisition.",
];

const stage = (name: string) => console.log("SMOKE_STAGE " + name);
const fail = (msg: string) => { console.log("SMOKE_FAIL " + msg); throw new Error(msg); };

const worker = new Worker(new URL("./kokoro-worker.ts", import.meta.url), { type: "module" });
let nextId = 1;
const waiters = new Map<number, (r: any) => void>();
worker.onmessage = (e: MessageEvent) => {
  if ((e.data.type === "ran" || e.data.type === "diag") && waiters.has(e.data.id)) { waiters.get(e.data.id)!(e.data); waiters.delete(e.data.id); }
  if (e.data.type === "error") {
    const w = e.data.id != null ? waiters.get(e.data.id) : null;
    if (w) { w(e.data); waiters.delete(e.data.id); } else fail("worker error: " + e.data.error);
  }
};
const rpc = (msg: object, timeoutMs = 180000) => new Promise((resolve) => {
  const id = nextId++;
  waiters.set(id, resolve);
  setTimeout(() => { if (waiters.has(id)) { waiters.delete(id); resolve({ type: "timeout", id }); } }, timeoutMs);
  worker.postMessage({ ...msg, id });
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

function concat(parts: Float32Array[], gapSec = 0): Float32Array {
  const gap = Math.round(gapSec * SR);
  const n = parts.reduce((s, p) => s + p.length, 0) + gap * Math.max(0, parts.length - 1);
  const out = new Float32Array(n);
  let o = 0;
  parts.forEach((p, i) => {
    if (i > 0) o += gap;
    out.set(p, o); o += p.length;
  });
  return out;
}

function encodeWav(f32: Float32Array): ArrayBuffer {
  const n = f32.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < 4; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); ws(8, "WAVE"); ws(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  ws(36, "data"); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, f32[i]));
    dv.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return buf;
}
async function saveWav(name: string, samples: Float32Array) {
  await fetch("/__savewav__/?name=" + encodeURIComponent(name), { method: "POST", body: encodeWav(samples) });
}

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

(async () => {
  try {
    stage("rss-baseline");
    await sleep(1500);
    console.log("SMOKE_LOG isolated=" + crossOriginIsolated + " cores=" + navigator.hardwareConcurrency);
    document.getElementById("log")!.textContent = "isolated=" + crossOriginIsolated + " cores=" + navigator.hardwareConcurrency;

    const t0 = performance.now();
    const initPromise = new Promise((r) => worker.addEventListener("message", function h(e: MessageEvent) {
      if (e.data.type === "inited") { worker.removeEventListener("message", h); r(e.data.ms); }
      if (e.data.type === "error") { worker.removeEventListener("message", h); fail("init error: " + e.data.error); r(-1); }
    }));
    worker.postMessage({ cmd: "init", threads: THREADS, verbose: params.get("verbose") === "1" });
    const initMs = await initPromise;
    if (initMs === -1 || typeof initMs !== "number") fail("init failed");
    stage("rss-loaded");
    console.log("SMOKE_LOG initMs=" + initMs);

    // 1) 原生标点模式
    const native: any[] = [];
    const nativeSamples: Float32Array[] = [];
    for (let i = 0; i < SENTENCES.length; i++) {
      const r = await rpc({ cmd: "run", mode: "native", text: SENTENCES[i] });
      if (r.type !== "ran") fail("native run failed: " + JSON.stringify(r).slice(0, 500));
      const samples = new Float32Array(r.samples);
      native.push({ i, words: wordCount(SENTENCES[i]), synthMs: r.synthMs, audioMs: +r.audioMs.toFixed(2),
        rtf: +(r.synthMs / 1000 / r.audioMs).toFixed(3), phonemes: r.phonemes });
      nativeSamples.push(samples);
      if (i === 0) stage("rss-after-1");
      console.log(`SMOKE_LOG native[${i}] ${r.synthMs}ms audio=${r.audioMs.toFixed(2)}s rtf=${(r.synthMs / 1000 / r.audioMs).toFixed(3)}`);
    }
    stage("rss-after-15");
    await saveWav("kokoro-native.wav", concat(nativeSamples, 0.7));

    // 2) 再插静音模式（意群切分 + 段间填零）
    const paused: any[] = [];
    const pausedSamples: Float32Array[] = [];
    for (let i = 0; i < SENTENCES.length; i++) {
      const r = await rpc({ cmd: "run", mode: "pauses", text: SENTENCES[i] });
      if (r.type !== "ran") fail("pauses run failed: " + JSON.stringify(r).slice(0, 500));
      const samples = new Float32Array(r.samples);
      paused.push({ i, synthMs: r.synthMs, audioMs: +r.audioMs.toFixed(2), chunks: r.chunks });
      pausedSamples.push(samples);
    }
    await saveWav("kokoro-pauses.wav", concat(pausedSamples, 0.8));

    // 3) 浸泡：循环合成 SOAK_SEC 秒，每 30s 报一次 RSS 阶段
    const soak: { t: number; iters: number; synthMs: number; audioMs: number }[] = [];
    let iters = 0, soakSynth = 0, soakAudio = 0;
    if (SOAK_SEC > 0) {
      const start = performance.now();
      let nextMark = start + 30000;
      // 浸泡用短句（~8 词），保证 30 分钟内迭代 ≥30；内存高水位与长句相同（同一张图）
      const SOAK_SET = [SENTENCES[5], SENTENCES[10], SENTENCES[11]];
      while (performance.now() - start < SOAK_SEC * 1000) {
        const text = SOAK_SET[iters % SOAK_SET.length];
        const r = await rpc({ cmd: "run", mode: "native", text });
        if (r.type !== "ran") fail("soak run failed");
        iters++; soakSynth += r.synthMs; soakAudio += r.audioMs;
        if (performance.now() >= nextMark) {
          const t = Math.round((performance.now() - start) / 1000);
          stage("soak-" + t);
          soak.push({ t, iters, synthMs: soakSynth, audioMs: +soakAudio.toFixed(1) });
          nextMark += 30000;
        }
      }
    }
    stage("rss-pre-dispose");
    worker.terminate();
    if ((globalThis as any).gc) (globalThis as any).gc();
    await sleep(8000);
    if ((globalThis as any).gc) (globalThis as any).gc();
    await sleep(4000);
    stage("rss-final");

    const rtfs = native.map((x) => x.rtf).sort((a, b) => a - b);
    const shortFirst = native.filter((x) => x.words <= 20).map((x) => x.synthMs).sort((a, b) => a - b);
    const result = {
      initMs, crossOriginIsolated, cores: navigator.hardwareConcurrency, threads: THREADS,
      native, paused,
      rtfP50: +pct(rtfs, 50).toFixed(3), rtfP95: +pct(rtfs, 95).toFixed(3), rtfMax: +Math.max(...rtfs).toFixed(3),
      firstAudioP50Ms: pct(shortFirst, 50), firstAudioMaxMs: Math.max(...shortFirst),
      soak: { seconds: SOAK_SEC, iters, points: soak },
      wav: ["kokoro-native.wav", "kokoro-pauses.wav"],
      nonEmpty: native.every((x) => x.audioMs > 0.2),
    };
    console.log("SMOKE_RESULT " + JSON.stringify(result));
  } catch (e) {
    fail(String((e as Error)?.stack || e));
  }
})();
