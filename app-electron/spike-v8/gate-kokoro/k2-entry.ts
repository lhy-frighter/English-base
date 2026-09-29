// 对照实验页面：3.8.1 直连 Kokoro，3 句，打印分段耗时与结果。?threads=1
const params = new URLSearchParams(location.search);
const THREADS = Number(params.get("threads") ?? "1");
const SR = 24000;
const SENTENCES = [
  "Hello world, this is a diagnostic test.",
  "Attention mechanisms allow parallel computation across all tokens.",
  "Dr. Smith published 3.14 pages in the U.S. in 2024, earning 1,000 citations.",
];
const stage = (s: string) => console.log("SMOKE_STAGE " + s);
const fail = (m: string) => { console.log("SMOKE_FAIL " + m); throw new Error(m); };

const worker = new Worker(new URL("./k2-worker.ts", import.meta.url), { type: "module" });
let seq = 1;
const waiters = new Map<number, (r: any) => void>();
worker.onmessage = (e) => {
  if (e.data.type === "inited" && e.data.id == null) initResolve?.(e.data);
  if (e.data.type === "ran" && waiters.has(e.data.id)) { waiters.get(e.data.id)!(e.data); waiters.delete(e.data.id); }
  if (e.data.type === "error") {
    if (e.data.id != null && waiters.has(e.data.id)) { waiters.get(e.data.id)!(e.data); waiters.delete(e.data.id); }
    else fail("worker error: " + e.data.error);
  }
};
let initResolve: ((d: any) => void) | null = null;
const rpc = (msg: object, timeoutMs = 180000) => new Promise((resolve) => {
  const id = seq++;
  waiters.set(id, resolve);
  setTimeout(() => { if (waiters.has(id)) { waiters.delete(id); resolve({ type: "timeout", id }); } }, timeoutMs);
  worker.postMessage({ ...msg, id });
});

(async () => {
  try {
    stage("rss-baseline");
    console.log("SMOKE_LOG isolated=" + crossOriginIsolated + " threads=" + THREADS);
    await new Promise<void>((resolve, reject) => {
      initResolve = () => resolve();
      worker.postMessage({ cmd: "init", threads: THREADS });
      setTimeout(() => reject(new Error("init timeout")), 180000);
    });
    stage("rss-loaded");
    const rows: any[] = [];
    for (const text of SENTENCES) {
      const r = await rpc({ cmd: "run", text });
      if (r.type !== "ran") fail("run failed: " + JSON.stringify(r).slice(0, 500));
      rows.push({ text: text.slice(0, 40), phonMs: r.phonMs, runMs: r.runMs, totalMs: r.totalMs, audioMs: +r.audioMs.toFixed(2), outKeys: r.outKeys, phonemes: r.phonemes });
      console.log("SMOKE_LOG ran phon=" + r.phonMs + "ms run=" + r.runMs + "ms audio=" + r.audioMs.toFixed(2) + "s keys=" + r.outKeys.join(","));
    }
    worker.terminate();
    console.log("SMOKE_RESULT " + JSON.stringify({ rows }));
  } catch (e) {
    console.log("SMOKE_FAIL " + ((e as Error)?.stack || String(e)));
  }
})();
