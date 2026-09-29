// Smart Turn 运行时服务（渲染层单例）：管理推理 Worker 的初始化、预测、释放。
// 模型 8.7MB（BSD-2-Clause），随包分发、不走模型商店；体小且与 VAD 同生命周期，
// 不进 InferenceCoordinator 互斥租约，关免提/话题切换时由对话页 dispose。
import { SMARTTURN_ASSET_MANIFEST } from "./smartturn-manifest";

export interface SmartTurnResult {
  ms: number;
  prob: number;
}

interface Pending {
  resolve: (m: never) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class SmartTurnService {
  private worker: Worker | null = null;
  private waiters = new Map<number, Pending>();
  private ready = false;
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();

  get isReady(): boolean {
    return this.ready;
  }

  // fatal/崩溃统一收口：拒绝所有在途请求并销毁 Worker，保证下次调用全新重建
  private failAll(err: Error): void {
    for (const [, p] of this.waiters) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.waiters.clear();
    try {
      this.worker?.terminate();
    } catch {
      /* noop */
    }
    this.worker = null;
    this.ready = false;
  }

  private spawn(): Worker {
    const w = new Worker(new URL("./smartturn-worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; reqId?: number; run?: number; message?: string };
      if (m.type === "fatal") {
        this.failAll(new Error(m.message || "SmartTurn worker 错误"));
        return;
      }
      const key = m.type === "result" ? m.run : m.reqId;
      if (key == null) return;
      const p = this.waiters.get(key);
      if (p) {
        this.waiters.delete(key);
        clearTimeout(p.timer);
        p.resolve(m as never);
      }
    };
    w.onerror = (e) => this.failAll(new Error(e.message || "SmartTurn worker 崩溃"));
    return w;
  }

  private call<T>(msg: Record<string, unknown>, key: number, timeoutMs = 60000): Promise<T> {
    if (!this.worker) this.worker = this.spawn();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(key);
        reject(new Error("超时: " + key));
      }, timeoutMs);
      this.waiters.set(key, { resolve: resolve as Pending["resolve"], reject, timer });
      this.worker!.postMessage(msg);
    });
  }

  // 加载前按随包可信清单逐文件校验（字节数 + SHA256）
  private async verifyAssets(base: string): Promise<void> {
    for (const spec of SMARTTURN_ASSET_MANIFEST) {
      const res = await fetch(base + spec.path);
      if (!res.ok) throw new Error(`smartturn_asset_missing: ${spec.path}`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== spec.bytes) throw new Error(`smartturn_asset_size: ${spec.path}`);
      const sha = await sha256Hex(buf);
      if (sha !== spec.sha256) throw new Error(`smartturn_asset_hash: ${spec.path}`);
    }
  }

  async init(): Promise<{ ms: number }> {
    if (this.ready) return { ms: 0 };
    const base = new URL("smartturn/", document.baseURI).href;
    const ortBase = new URL("smartturn/ort/", document.baseURI).href;
    await this.verifyAssets(base);
    const reqId = ++this.seq;
    const r = await this.call<{ ms: number }>(
      { type: "init", reqId, modelBase: base, ortBase },
      reqId,
      120000,
    );
    this.ready = true;
    return { ms: r.ms };
  }

  // 串行化：单 Worker 内预测排队，避免并发竞争
  predict(pcm: Float32Array): Promise<SmartTurnResult> {
    const run = (this.chain = this.chain.then(() => this.runOnce(pcm)));
    return run as Promise<SmartTurnResult>;
  }

  private async runOnce(pcm: Float32Array): Promise<SmartTurnResult> {
    if (!this.ready) await this.init();
    const run = ++this.seq;
    const r = await this.call<{ ms: number; prob: number }>(
      { type: "predict", run, pcm },
      run,
      30000,
    );
    return { ms: r.ms, prob: r.prob };
  }

  async dispose(): Promise<void> {
    if (!this.worker) {
      this.ready = false;
      return;
    }
    const reqId = ++this.seq;
    try {
      await this.call({ type: "dispose", reqId }, reqId, 5000);
    } catch {
      /* 退出允许失败 */
    }
    try {
      this.worker.terminate();
    } catch {
      /* noop */
    }
    this.worker = null;
    this.ready = false;
    this.waiters.clear();
  }
}

export const smartTurn = new SmartTurnService();
