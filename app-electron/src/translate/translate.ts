// S7b 离线翻译运行时服务（渲染层单例）：管理 Bergamot classic Worker 的初始化、按段翻译与释放。
// ADR-4：引擎/模型 MPL-2.0；Worker 为单线程 WASM，不依赖 crossOriginIsolated；
// 与 ASR 经 InferenceCoordinator 互斥（首译后约 +420MB RSS，不可并存）。
import { api } from "../api";

export interface MtPair { src: string; tgt: string }
export interface MtResult { ms: number; zh: string[]; pairs: MtPair[][] }

const MODEL_ID = "bergamot-enzh";
const ENGINE = "bergamot-0.4.9";
// 模型文件名 → Worker 期望的角色（与 vendor/bergamot/translator-worker.js 协议一致）
const FILE_ROLES = {
  model: "model.enzh.intgemm.alphas.bin",
  shortlist: "lex.50.50.enzh.s2t.bin",
  srcvocab: "srcvocab.enzh.spm",
  trgvocab: "trgvocab.enzh.spm",
} as const;

interface Pending { resolve: (m: never) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

export class TranslateService {
  private worker: Worker | null = null;
  private waiters = new Map<number, Pending>();
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private readyRevision: string | null = null;

  get isReady() { return this.readyRevision !== null; }
  get modelId() { return MODEL_ID; }
  get engine() { return ENGINE; }
  get revision() { return this.readyRevision; }

  private failAll(err: Error) {
    for (const [, p] of this.waiters) { clearTimeout(p.timer); p.reject(err); }
    this.waiters.clear();
    try { this.worker?.terminate(); } catch { /* noop */ }
    this.worker = null;
    this.readyRevision = null;
  }

  private spawn(): Worker {
    // classic worker 随 vite copyBergamot 插件原样落到 dist/bergamot/，不进打包图
    const url = new URL("bergamot/translator-worker.js", document.baseURI).href;
    const w = new Worker(/* @vite-ignore */ url);
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; reqId?: number; id?: number; message?: string };
      if (m.type === "fatal") {
        this.failAll(new Error(m.message || "翻译 worker 错误"));
        return;
      }
      const key = m.type === "result" ? m.id : m.reqId;
      if (key == null) return;
      const p = this.waiters.get(key);
      if (p) { this.waiters.delete(key); clearTimeout(p.timer); p.resolve(m as never); }
    };
    w.onerror = (e) => this.failAll(new Error(e.message || "翻译 worker 崩溃"));
    return w;
  }

  private call<T>(msg: Record<string, unknown>, key: number, timeoutMs = 180000): Promise<T> {
    if (!this.worker) this.worker = this.spawn();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(key); reject(new Error("翻译超时: " + key)); }, timeoutMs);
      this.waiters.set(key, { resolve: resolve as Pending["resolve"], reject, timer });
      this.worker!.postMessage(msg);
    });
  }

  // 由 InferenceCoordinator 在互斥锁内调用；模型下载/深校验由主进程 modelRuntime 保证
  async init(): Promise<{ revision: string; ms: number }> {
    if (this.readyRevision) return { revision: this.readyRevision, ms: 0 };
    const rt = await api.modelRuntime(MODEL_ID);
    const modelBase = `${rt.base}/${rt.repo}/resolve/${rt.revision}`;
    const reqId = ++this.seq;
    const r = await this.call<{ ms: number }>(
      { type: "init", reqId, modelBase, revision: rt.revision, files: FILE_ROLES }, reqId, 300000);
    this.readyRevision = rt.revision;
    return { revision: rt.revision, ms: r.ms };
  }

  // 串行化：单 Worker 内引擎忙，排队保证不丢请求
  translate(paras: string[], withPairs = true): Promise<MtResult> {
    const run = (this.chain = this.chain.then(() => this.runOnce(paras, withPairs)).catch((e) => { throw e; }));
    return run as Promise<MtResult>;
  }

  private async runOnce(paras: string[], withPairs: boolean): Promise<MtResult> {
    if (!this.readyRevision) await this.init();
    if (!paras.length) return { ms: 0, zh: [], pairs: [] };
    const id = ++this.seq;
    const r = await this.call<MtResult>({ type: "translate", id, paras, withPairs }, id, 180000);
    return { ms: r.ms, zh: r.zh, pairs: r.pairs };
  }

  async dispose(): Promise<void> {
    if (!this.worker) { this.readyRevision = null; return; }
    const reqId = ++this.seq;
    try { await this.call({ type: "dispose", reqId }, reqId, 5000); } catch { /* 退出允许失败 */ }
    try { this.worker.terminate(); } catch { /* noop */ }
    this.worker = null;
    this.readyRevision = null;
    this.waiters.clear();
  }
}

export const translator = new TranslateService();
