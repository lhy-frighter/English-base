// ADR-5 Kokoro 神经 TTS 渲染层服务：管理 Worker 初始化（含热身）、逐块合成、释放与 fatal 重建。
// 与 AsrService/TranslateService 同范式：消息带唯一 id、串行链、fatal 后 terminate + 清空 ready。
// 模型下载/深校验由主进程 model store 负责；本服务只在已安装时工作，未安装由 tts.ts 降级 SAPI。
import { api } from "../api";

const MODEL_ID = "kokoro-82m";
const SR = 24000;

interface Pending { resolve: (m: never) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
export interface KokoroChunk { pcm: Float32Array; sampleRate: number; ms: number; audioMs: number }
export interface KokoroInitInfo { ms: number; warmMs: number; threads: number; revision: string }

export class KokoroTtsService {
  private worker: Worker | null = null;
  private waiters = new Map<number, Pending>();
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private initInfo: KokoroInitInfo | null = null;

  get isReady() { return this.initInfo !== null; }
  get revision() { return this.initInfo?.revision ?? null; }
  get sampleRate() { return SR; }

  // 模型是否已安装并通过深校验（不触发下载）
  async isInstalled(): Promise<boolean> {
    try {
      const st = await api.modelStatus(MODEL_ID);
      return st.state === "installed";
    } catch { return false; }
  }

  private failAll(err: Error) {
    for (const [, p] of this.waiters) { clearTimeout(p.timer); p.reject(err); }
    this.waiters.clear();
    try { this.worker?.terminate(); } catch { /* noop */ }
    this.worker = null;
    this.initInfo = null;
  }

  private spawn(): Worker {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; reqId?: number; id?: number; message?: string };
      if (m.type === "fatal") {
        this.failAll(new Error(m.message || "TTS worker 错误"));
        return;
      }
      const key = m.reqId ?? m.id;
      if (key == null) return;
      const p = this.waiters.get(key);
      if (p) { this.waiters.delete(key); clearTimeout(p.timer); p.resolve(m as never); }
    };
    w.onerror = (e) => this.failAll(new Error(e.message || "TTS worker 崩溃"));
    return w;
  }

  private call<T>(msg: Record<string, unknown>, key: number, timeoutMs = 300000): Promise<T> {
    if (!this.worker) this.worker = this.spawn();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(key); reject(new Error("TTS 超时: " + key)); }, timeoutMs);
      this.waiters.set(key, { resolve: resolve as Pending["resolve"], reject, timer });
      this.worker!.postMessage(msg);
    });
  }

  private pickThreads(): number {
    if (!self.crossOriginIsolated) return 1;
    return Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4));
  }

  // 由 InferenceCoordinator 在互斥锁内调用
  async init(): Promise<KokoroInitInfo> {
    if (this.initInfo) return this.initInfo;
    const rt = await api.modelRuntime(MODEL_ID); // 未安装/被篡改会抛错，调用方降级 SAPI
    const reqId = ++this.seq;
    const ready = await this.call<{ ms: number; threads: number }>({
      type: "init", reqId, modelBase: rt.base, repo: rt.repo, revision: rt.revision, threads: this.pickThreads(),
    }, reqId, 300000);
    // 后台热身：加载音色 + 首轮图编译，把离群延迟挡在真实播放之前（ADR-5 条件 #1）
    const warmId = ++this.seq;
    const warm = await this.call<{ ms: number }>({ type: "warm", reqId: warmId }, warmId, 300000);
    this.initInfo = { ms: ready.ms, warmMs: warm.ms, threads: ready.threads, revision: rt.revision };
    return this.initInfo;
  }

  // 串行合成单个意群块（文本 + 块尾停顿），返回 24kHz Float32
  synthChunk(text: string, pauseMs: number, seamless = false): Promise<KokoroChunk> {
    const run = (this.chain = this.chain.then(() => this.runChunk(text, pauseMs, seamless)).catch((e) => { throw e; }));
    return run as Promise<KokoroChunk>;
  }

  private async runChunk(text: string, pauseMs: number, seamless: boolean): Promise<KokoroChunk> {
    if (!this.initInfo) await this.init();
    const id = ++this.seq;
    const r = await this.call<{ samples: ArrayBuffer; ms: number; audioMs: number }>(
      { type: "chunk", id, text, pauseMs, seamless }, id, 120000);
    return { pcm: new Float32Array(r.samples), sampleRate: SR, ms: r.ms, audioMs: r.audioMs };
  }

  async dispose(): Promise<void> {
    if (!this.worker) { this.initInfo = null; return; }
    const reqId = ++this.seq;
    try { await this.call({ type: "dispose", reqId }, reqId, 5000); } catch { /* 退出允许失败 */ }
    try { this.worker.terminate(); } catch { /* noop */ }
    this.worker = null;
    this.initInfo = null;
    this.waiters.clear();
  }
}

export const kokoroTts = new KokoroTtsService();
