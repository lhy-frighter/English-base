// TurnAssembler：把 VAD 的"段"自动收束成"轮"。
// VAD 只知道"安静了"，不知道这句是否完整；段尾对末尾音频跑 Smart Turn：
//   prob ≥ 阈值 → 立即提交整轮；prob < 阈值 → 进 awaiting，等用户继续；
//   2.5s 内未再开口 → 强制提交（防悬置），期间重新开口则取消等待。
// 提交时把多段 PCM 能量裁首尾、按墙钟间隔补静音，组装成自然整轮。

import { SMARTTURN_THRESHOLD, SMARTTURN_MAX_WAIT_MS } from "./smartturn-manifest.ts";

export type AssemblerState = "idle" | "listening" | "awaiting";

export interface TurnAssemblerDeps {
  // Smart Turn 预测（生产环境注入 smartTurn.predict）
  predict: (pcm: Float32Array) => Promise<{ prob: number }>;
  // 整轮组装完成回调（生产环境接转写发送管线）
  onCommit: (pcm: Float32Array) => void;
  onStateChange?: (state: AssemblerState) => void;
  threshold?: number;
  maxWaitMs?: number;
}

interface RawSeg {
  audio: Float32Array;
  tStart: number;
  tEnd: number;
}

const SR = 16000;
const KEEP_MS = 120; // 裁首尾静音时各保留的自然余量
const REDEMPTION_MS = 1400; // VAD 段尾已含约 1.4s 静音（vad-web redemptionMs）
const FRAME = 320; // 20ms @16kHz

// 20ms 帧 RMS 能量裁首尾静音；阈值 max(0.01, 0.05×峰值)，各保留约 120ms 自然尾
export function energyTrim(a: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < a.length; i++) {
    const v = Math.abs(a[i]);
    if (v > peak) peak = v;
  }
  const thr = Math.max(0.01, 0.05 * peak);
  const frameRms = (from: number): number => {
    let s = 0;
    const n = Math.min(FRAME, a.length - from);
    for (let i = 0; i < n; i++) s += a[from + i] ** 2;
    return Math.sqrt(s / n);
  };
  let start = 0;
  while (start + FRAME <= a.length) {
    if (frameRms(start) >= thr) break;
    start += FRAME;
  }
  start = Math.max(0, start - Math.round((KEEP_MS / 1000) * SR));
  let end = a.length;
  while (end - FRAME >= 0) {
    if (frameRms(end - FRAME) >= thr) break;
    end -= FRAME;
  }
  end = Math.min(a.length, end + Math.round((KEEP_MS / 1000) * SR));
  if (end <= start) return a;
  return a.slice(start, end);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export class TurnAssembler {
  private deps: TurnAssemblerDeps;
  private segs: RawSeg[] = [];
  private segStart = 0;
  private state: AssemblerState = "idle";
  private forceTimer: ReturnType<typeof setTimeout> | null = null;
  private cycle = 0; // 每次开口/收段自增，异步判定据此判断是否已过期
  private committing = false;

  constructor(deps: TurnAssemblerDeps) {
    this.deps = deps;
  }

  private setState(s: AssemblerState): void {
    if (this.state === s) return;
    this.state = s;
    this.deps.onStateChange?.(s);
  }

  get currentState(): AssemblerState {
    return this.state;
  }

  // VAD SpeechStart：awaiting 态说明用户继续开口 → 取消强制提交，回收听状态
  notifyStart(t: number): void {
    this.cycle++;
    this.segStart = t;
    if (this.forceTimer) {
      clearTimeout(this.forceTimer);
      this.forceTimer = null;
    }
    this.setState("listening");
  }

  // VAD SpeechEnd：存段 → Smart Turn 判定末尾 8s
  async notifyEnd(t: number, audio: Float32Array): Promise<void> {
    const myCycle = ++this.cycle;
    this.segs.push({ audio, tStart: this.segStart, tEnd: t });
    let prob: number;
    try {
      const r = await this.deps.predict(audio);
      prob = r.prob;
    } catch {
      // 判定服务异常：不阻塞学习，直接提交
      prob = 1;
    }
    // 等待期间用户已重新开口 → 本次判定作废，继续攒段
    if (myCycle !== this.cycle || this.state === "idle") return;
    const threshold = this.deps.threshold ?? SMARTTURN_THRESHOLD;
    if (prob >= threshold) {
      this.commit();
      return;
    }
    // 不像说完：进 awaiting，启动强制提交定时器
    this.setState("awaiting");
    const maxWait = this.deps.maxWaitMs ?? SMARTTURN_MAX_WAIT_MS;
    this.forceTimer = setTimeout(() => {
      this.forceTimer = null;
      if (this.state === "awaiting") this.commit();
    }, maxWait);
  }

  // 「立即发送」按钮：awaiting/listening 态用户手动提交
  commitNow(): void {
    if (this.segs.length === 0 || this.committing) return;
    this.commit();
  }

  private commit(): void {
    if (this.committing) return;
    this.committing = true;
    if (this.forceTimer) {
      clearTimeout(this.forceTimer);
      this.forceTimer = null;
    }
    const pcm = this.assemble();
    this.resetState();
    this.committing = false;
    this.deps.onCommit(pcm);
  }

  // 多段：各段能量裁首尾，段间按墙钟 gap 补静音
  private assemble(): Float32Array {
    const lastRaw = this.segs[this.segs.length - 1].audio;
    if (this.segs.length === 1) {
      // energyTrim 内部已对退化（空/全静音）情况回退原段，短话语直接信任裁剪结果
      return energyTrim(this.segs[0].audio);
    }
    const parts: Float32Array[] = [];
    let total = 0;
    for (let i = 0; i < this.segs.length; i++) {
      const raw = this.segs[i].audio;
      const use = energyTrim(raw);
      if (i > 0) {
        const prev = this.segs[i - 1];
        // 实际说完 ≈ tEnd - 1.4s；gap 为两段语音之间的真实墙钟间隔
        const gap = this.segs[i].tStart - (prev.tEnd - REDEMPTION_MS);
        const gapMs = clamp(gap - 240, 60, 3000);
        const sil = new Float32Array(Math.round((gapMs / 1000) * SR));
        parts.push(sil);
        total += sil.length;
      }
      parts.push(use);
      total += use.length;
    }
    const out = new Float32Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    // 组装异常（短于最后 raw 段一半）→ 回退直接用最后 raw 段
    return out.length >= lastRaw.length / 2 ? out : lastRaw;
  }

  reset(): void {
    this.resetState();
  }

  private resetState(): void {
    if (this.forceTimer) {
      clearTimeout(this.forceTimer);
      this.forceTimer = null;
    }
    this.segs = [];
    this.cycle++;
    this.setState("idle");
  }
}
