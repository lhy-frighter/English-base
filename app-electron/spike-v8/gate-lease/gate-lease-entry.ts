// S7c 三租约闸门：ASR(whisper-base) → Kokoro TTS → 翻译(Bergamot) → Kokoro TTS。
// ASR/翻译走生产 InferenceCoordinator；Kokoro 为 spike Worker，手动创建/terminate，
// 验证三类推理 Worker 绝不同时驻留（RSS 只落在当前单租约区间，最终回落基线）。
import { asr } from "../../src/asr/asr";
import { translator } from "../../src/translate/translate";
import { inference } from "../../src/inference/coordinator";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gc = () => { try { (globalThis as { gc?: () => void }).gc?.(); } catch { /* noop */ } };
const stage = (n: string) => console.log("SMOKE_STAGE " + n);

class KokoroLease {
  private w: Worker | null = null;
  private seq = 1;
  private waiters = new Map<number, (r: any) => void>();
  async start() {
    this.w = new Worker(new URL("../gate-kokoro/kokoro-worker.ts", import.meta.url), { type: "module" });
    this.w.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if ((d.type === "ran" || d.type === "diag" || d.type === "inited") && d.id != null && this.waiters.has(d.id)) {
        this.waiters.get(d.id)!(d); this.waiters.delete(d.id);
      }
      if (d.type === "inited" && d.id == null) this.initResolve?.(d);
      if (d.type === "error") { console.log("KOKORO-WORKER-ERROR " + d.error); if (d.id != null && this.waiters.has(d.id)) { this.waiters.get(d.id)!(d); this.waiters.delete(d.id); } }
    };
    await new Promise<void>((resolve, reject) => {
      this.initResolve = () => resolve();
      this.w!.postMessage({ cmd: "init" });
      setTimeout(() => reject(new Error("kokoro init timeout")), 120000);
    });
  }
  private initResolve: ((d: any) => void) | null = null;
  rpc(msg: object, timeoutMs = 180000) {
    return new Promise<any>((resolve, reject) => {
      const id = this.seq++;
      const t = setTimeout(() => { this.waiters.delete(id); reject(new Error("kokoro rpc timeout " + id)); }, timeoutMs);
      this.waiters.set(id, (r) => { clearTimeout(t); resolve(r); });
      this.w!.postMessage({ ...msg, id });
    });
  }
  async synth(text: string, mode: "native" | "pauses" = "native") {
    const r = await this.rpc({ cmd: "run", mode, text });
    if (r.type !== "ran") throw new Error("kokoro run failed: " + JSON.stringify(r).slice(0, 300));
    return { synthMs: r.synthMs, audioMs: r.audioMs, n: r.samples.byteLength };
  }
  dispose() { this.w?.terminate(); this.w = null; }
}

async function transcribeSilence(seconds = 1) {
  const pcm = new Float32Array(16000 * seconds);
  const r = await asr.transcribe(pcm, { language: "en" });
  return { ms: r.ms, text: r.text, nwords: r.words.length };
}

const PARAS = [
  "Researchers at the university announced a new method for translating languages entirely on the user's own computer.",
  "The model runs inside the browser and never sends text to a remote server, which protects reader privacy.",
  "Officials said the investigation produced no evidence that any serious irregularities took place during the election.",
  "A severe storm moved through the region overnight, leaving thousands of homes without power until morning.",
  "Reading difficult material every day is one of the most reliable ways to expand an adult learner's vocabulary.",
  "The committee praised the volunteers who worked through the night to distribute food and medicine to families.",
];

(async () => {
  const out: Record<string, unknown> = { steps: [] };
  try {
    gc(); await sleep(1000); stage("rss-baseline");

    // 1) ASR 租约
    await inference.acquire("asr");
    await asr.init("wasm", "whisper-base");
    out.asr1 = await transcribeSilence();
    gc(); await sleep(2500); stage("rss-asr");

    // 2) 释放 ASR → Kokoro TTS
    await inference.release("asr");
    out.asrDisposedBeforeTts = !asr.isReady;
    const tts1 = new KokoroLease();
    await tts1.start();
    out.tts1a = await tts1.synth("Attention mechanisms allow parallel computation across all tokens.");
    out.tts1b = await tts1.synth("Dr. Smith published 3.14 pages in the U.S. in 2024, earning 1,000 citations.", "pauses");
    gc(); await sleep(2500); stage("rss-tts1");
    tts1.dispose();
    gc(); await sleep(3000); stage("rss-tts1-disposed");

    // 3) 翻译租约（Kokoro 已销毁）
    await inference.acquire("translation");
    const r = await translator.translate(PARAS, true);
    out.mt = { ms: r.ms, n: r.zh.length, empty: r.zh.filter((z) => !z.trim()).length, sample: r.zh[0].slice(0, 80) };
    gc(); await sleep(2500); stage("rss-mt");

    // 4) 释放翻译 → Kokoro TTS 再起
    await inference.release("translation");
    out.mtDisposedBeforeTts2 = !translator.isReady;
    const tts2 = new KokoroLease();
    await tts2.start();
    out.tts2a = await tts2.synth("The transformer relies on multi-head self-attention and positional encodings.");
    gc(); await sleep(2500); stage("rss-tts2");
    tts2.dispose();
    gc(); await sleep(7000); stage("rss-final");

    out.allReleased = !asr.isReady && !translator.isReady;
    console.log("SMOKE_RESULT " + JSON.stringify(out));
  } catch (e) {
    console.log("SMOKE_FAIL " + ((e as Error)?.stack || String(e)));
  }
})();
