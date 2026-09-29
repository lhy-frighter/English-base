// V6 ASR 运行时服务（渲染层单例）：管理推理 Worker 的初始化、转写、释放与线程/设备回落。
// ADR-3：多线程 WASM 默认，WebGPU 默认关；crossOriginIsolated 失败回落单线程，绝不让功能报废。
// hardening-0（P0-4）：每条消息带唯一 id 匹配响应（不再按 type 共享 waiter，避免并发互相覆盖）；
// transcribe 串行排队（单 Worker 内不可并行）；worker fatal/error 后 terminate + 清空 ready，下一次调用重建。
import { api } from "../api";

export interface AsrWord { w: string; t: [number, number | null] }
export interface AsrResult { ms: number; text: string; words: AsrWord[] }
export interface AsrInitInfo { ms: number; threads: number; device: string; isolated: boolean; revision: string }

// 真人回归集裁决（2026-09-16，10 句）：base 英文微平均 WER 0.197→0.148、且解锁中文，跟读台默认升 base；tiny.en 留作轻量备选。
const DEFAULT_MODEL = "whisper-base";
const REPO_BY_MODEL: Record<string, string> = {
  "whisper-tiny.en": "Xenova/whisper-tiny.en",
  "whisper-base": "Xenova/whisper-base",
};

interface Pending { resolve: (m: never) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

export class AsrService {
  private worker: Worker | null = null;
  private waiters = new Map<number, Pending>();
  private initInfo: AsrInitInfo | null = null;
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private currentId = DEFAULT_MODEL;
  private multilingual = false;

  get isReady() { return this.initInfo !== null; }
  get info() { return this.initInfo; }
  get modelId() { return this.currentId; }
  get isMultilingual() { return this.multilingual; }

  // fatal/崩溃统一收口：拒绝所有在途请求并销毁 Worker，保证下次调用全新重建
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
      const m = e.data as { type: string; reqId?: number; run?: number; message?: string };
      if (m.type === "fatal") {
        this.failAll(new Error(m.message || "ASR worker 错误"));
        return;
      }
      const key = m.type === "result" ? m.run : m.reqId;
      if (key == null) return;
      const p = this.waiters.get(key);
      if (p) { this.waiters.delete(key); clearTimeout(p.timer); p.resolve(m as never); }
    };
    w.onerror = (e) => this.failAll(new Error(e.message || "ASR worker 崩溃"));
    return w;
  }

  private call<T>(msg: Record<string, unknown>, key: number, timeoutMs = 180000): Promise<T> {
    if (!this.worker) this.worker = this.spawn();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(key); reject(new Error("超时: " + key)); }, timeoutMs);
      this.waiters.set(key, { resolve: resolve as Pending["resolve"], reject, timer });
      this.worker!.postMessage(msg);
    });
  }

  pickThreads(): number {
    if (!self.crossOriginIsolated) return 1;
    return Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4));
  }

  async init(device: "wasm" | "webgpu" = "wasm", modelId: string = DEFAULT_MODEL): Promise<AsrInitInfo> {
    if (this.initInfo && this.currentId === modelId) return this.initInfo;
    const repo = REPO_BY_MODEL[modelId];
    if (!repo) throw new Error("未知模型: " + modelId);
    // 切换模型：销毁旧 Worker/管线后全新加载
    if (this.worker) {
      try { this.worker.terminate(); } catch { /* noop */ }
      this.worker = null;
      this.waiters.forEach((p) => { clearTimeout(p.timer); p.reject(new Error("模型切换，请求作废")); });
      this.waiters.clear();
    }
    // 首次加载前由主进程按可信清单深校验，并给出固定 commit revision
    const rt = await api.modelRuntime(modelId);
    const isolated = self.crossOriginIsolated;
    const threads = this.pickThreads();
    const reqId = ++this.seq;
    const r = await this.call<{ ms: number; threads: number; device: string }>(
      { type: "init", reqId, modelId: repo, modelBase: rt.base, revision: rt.revision, threads, device, multilingual: !!rt.multilingual },
      reqId, 300000);
    this.currentId = modelId;
    this.multilingual = !!rt.multilingual;
    this.initInfo = { ms: r.ms, threads: r.threads, device: r.device, isolated, revision: rt.revision };
    return this.initInfo;
  }

  // 串行化：单 Worker 内并发转写会互相竞争，排队保证不丢请求
  transcribe(pcm: Float32Array, opts?: { language?: string }): Promise<AsrResult> {
    const run = (this.chain = this.chain.then(() => this.runOnce(pcm, opts)).catch((e) => { throw e; }));
    return run as Promise<AsrResult>;
  }
  private async runOnce(pcm: Float32Array, opts?: { language?: string }): Promise<AsrResult> {
    if (!this.initInfo) await this.init();
    const run = ++this.seq;
    const r = await this.call<{ ms: number; text: string; words: AsrWord[] }>(
      { type: "transcribe", pcm, run, language: opts?.language }, run, 120000);
    return { ms: r.ms, text: r.text, words: r.words };
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

export const asr = new AsrService();
