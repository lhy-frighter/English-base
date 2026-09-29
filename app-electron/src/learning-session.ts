// S9-1 学习会话跟踪器（渲染进程）
// 生命周期：start（打开文章/进入跟读台）→ 每 20s 心跳（仅前台可见累计 active_ms）→ stop（离开/切文章/卸载）。
// 崩溃/杀进程时最后一次心跳之后最多损失约 20s，主进程启动回收会把残留 open 会话置 abandoned。
import { api } from "./api";

export type SessionKind = "read" | "shadow";

export interface StartOpts {
  refType: string;
  refId: string;
  titleSnapshot?: string;
  amount?: number;
  unit?: "words" | "sentences" | "";
  contentHash?: string;
}

const HEARTBEAT_MS = 20000;

export class SessionTracker {
  private key = "";
  private timer: number | null = null;
  private active = false;
  private activeSince = 0;
  private activeMs = 0;
  private amount = 0;
  private readonly onVis = (): void => this.syncActive();
  private readonly onFocus = (): void => this.syncActive();
  private readonly onBlur = (): void => this.syncActive();
  private readonly onUnload = (): void => {
    // 尽力而为：窗口直接关闭时 invoke 未必完成，未关闭部分由主进程回收兜底
    this.flushActive();
    if (this.key) {
      try { void api.sessionClose(this.key, this.activeMs, this.amount); } catch { /* ignore */ }
    }
  };

  get running(): boolean { return !!this.key; }

  async start(kind: SessionKind, o: StartOpts): Promise<void> {
    await this.stop();
    this.activeMs = 0;
    this.amount = Math.max(0, Math.floor(o.amount ?? 0));
    const key = `${kind}:${o.refType}:${o.refId || "none"}:${Date.now()}`;
    try {
      await api.sessionBegin({ kind, sessionKey: key, ...o, amount: this.amount });
    } catch {
      this.key = "";
      return;
    }
    this.key = key;
    this.active = false;
    this.syncActive(); // 按当前可见/焦点状态初始化
    document.addEventListener("visibilitychange", this.onVis);
    window.addEventListener("focus", this.onFocus);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("beforeunload", this.onUnload);
    this.timer = window.setInterval(() => { void this.heartbeat(); }, HEARTBEAT_MS);
  }

  setAmount(n: number): void { this.amount = Math.max(this.amount, Math.floor(n)); }
  bumpAmount(d = 1): void { this.amount += d; }

  private syncActive(): void {
    const nowActive = document.visibilityState === "visible" && document.hasFocus();
    if (nowActive === this.active) return;
    const now = Date.now();
    if (nowActive) {
      this.activeSince = now;
      this.active = true;
    } else {
      this.flushActive();
      this.active = false;
    }
  }

  private flushActive(): void {
    if (this.active) {
      this.activeMs += Date.now() - this.activeSince;
      this.activeSince = Date.now();
    }
  }

  private async heartbeat(): Promise<void> {
    if (!this.key) return;
    this.syncActive();
    this.flushActive();
    try { await api.sessionHeartbeat(this.key, this.activeMs, this.amount); } catch { /* 下一次心跳重试 */ }
  }

  async stop(): Promise<void> {
    if (!this.key) return;
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("focus", this.onFocus);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("beforeunload", this.onUnload);
    this.syncActive();
    this.flushActive();
    const key = this.key;
    const ms = this.activeMs;
    const amount = this.amount;
    this.key = "";
    this.active = false;
    try { await api.sessionClose(key, ms, amount); } catch { /* 回收兜底 */ }
  }
}
