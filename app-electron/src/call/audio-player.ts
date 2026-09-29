// S14-1C：下行 PCM 流式播放器
// - GLM Realtime 下行：int16 LE / mono / 24kHz
// - AudioContext 锁定 24kHz，逐块 sample-accurate 排程，边收边播
// - 打断时按 AudioContext 时钟精确计算"已听到的样本数"（用于已播文本前缀）

const OUT_RATE = 24000;

interface Scheduled {
  responseId: string;
  start: number;
  end: number;
  samples: number;
  source: AudioBufferSourceNode;
}

export interface HeardResult {
  responseId: string;
  heardSamples: number;
  totalSamples: number;
}

export class CallAudioPlayer {
  readonly ctx: AudioContext;
  private scheduled: Scheduled[] = [];
  private nextStart = 0;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor({ sampleRate: OUT_RATE, latencyHint: "interactive" });
    this.nextStart = this.ctx.currentTime + 0.08;
  }

  get sampleRate(): number { return this.ctx.sampleRate; }

  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  // 入队一块 int16 PCM；返回该响应累计样本数
  enqueue(responseId: string, bytes: ArrayBuffer): number {
    const u8 = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes);
    const n = u8.byteLength >> 1;
    const i16 = new Int16Array(u8.buffer, u8.byteOffset, n);
    const buffer = this.ctx.createBuffer(1, n, OUT_RATE);
    const out = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) out[i] = i16[i] / 32768;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    let start = this.nextStart;
    const now = this.ctx.currentTime;
    if (start < now + 0.03) start = now + 0.03; // 排程落后时贴回当前时刻
    source.start(start);
    const end = start + n / OUT_RATE;
    this.scheduled.push({ responseId, start, end, samples: n, source });
    this.nextStart = end;
    return this.totalSamples(responseId);
  }

  totalSamples(responseId: string): number {
    let total = 0;
    for (const s of this.scheduled) if (s.responseId === responseId) total += s.samples;
    return total;
  }

  // 最近一次排程的响应（response.done 后音频仍在播放时，打断按它裁已听前缀）
  currentResponseId(): string | null {
    if (!this.scheduled.length) return null;
    return this.scheduled[this.scheduled.length - 1].responseId;
  }

  // 当前时刻已听到的样本数（完整块 + 正在播放块的部分）
  heardSamples(responseId: string): number {
    const now = this.ctx.currentTime;
    let heard = 0;
    for (const s of this.scheduled) {
      if (s.responseId !== responseId) continue;
      if (s.end <= now) heard += s.samples;
      else if (s.start < now) heard += Math.floor((now - s.start) * OUT_RATE);
    }
    return heard;
  }

  get isPlaying(): boolean {
    const now = this.ctx.currentTime;
    return this.scheduled.some((s) => s.end > now);
  }

  // 停止指定响应（默认最新的响应）；返回已听样本统计供状态机固化
  stop(responseId?: string): HeardResult | null {
    if (!this.scheduled.length) return null;
    const target = responseId || this.scheduled[this.scheduled.length - 1].responseId;
    const heard = this.heardSamples(target);
    const total = this.totalSamples(target);
    for (const s of this.scheduled) {
      try { s.source.stop(); } catch { /* 已结束 */ }
      try { s.source.disconnect(); } catch { /* noop */ }
    }
    this.scheduled = [];
    this.nextStart = this.ctx.currentTime + 0.05;
    return { responseId: target, heardSamples: heard, totalSamples: total };
  }

  // 丢弃某响应尚未播放的全部块（已播放的保留）
  dropResponse(responseId: string): HeardResult {
    const heard = this.heardSamples(responseId);
    const total = this.totalSamples(responseId);
    const keep: Scheduled[] = [];
    for (const s of this.scheduled) {
      if (s.responseId === responseId) {
        try { s.source.stop(); } catch { /* noop */ }
        try { s.source.disconnect(); } catch { /* noop */ }
      } else keep.push(s);
    }
    this.scheduled = keep;
    if (keep.length) this.nextStart = Math.max(...keep.map((s) => s.end));
    return { responseId, heardSamples: heard, totalSamples: total };
  }

  async close(): Promise<void> {
    for (const s of this.scheduled) {
      try { s.source.stop(); } catch { /* noop */ }
    }
    this.scheduled = [];
    try { await this.ctx.close(); } catch { /* noop */ }
  }
}
