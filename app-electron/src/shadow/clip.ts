// 跟读台"单词级回听"：把本次录音的 16k PCM 按 Whisper 词级时间戳切成单词片段播放。
// Whisper 词戳是注意力/DTW 估算（ADR-3），所以切片只用于人工回听确认，不做发音评分；
// 边界两侧留少量留白，避免切掉起音/尾音。纯函数部分（wordSpan/slicePcm）可单测。

export interface Span { start: number; end: number }

export const CLIP_PAD_HEAD = 0.09; // 词前留白（秒）
export const CLIP_PAD_TAIL = 0.14; // 词后留白
export const CLIP_FALLBACK_LEN = 0.7; // t1 缺失时的兜底词长
export const CLIP_MAX_LEN = 2.4; // 单切片上限（戳异常时不把一整句都放进来）

/**
 * 计算单词回听区间。
 * @param t0 词起始（秒，必有）
 * @param t1 词结束（秒，可能 null）
 * @param nextT0 下一个有时间戳词的起始（用于 t1 缺失时收口，避免播到下一个词）
 * @param duration 整段录音时长（秒）
 */
export function wordSpan(
  t0: number, t1: number | null | undefined, nextT0: number | null, duration: number,
): Span {
  if (!Number.isFinite(t0) || t0 < 0) return { start: 0, end: 0 };
  let end: number;
  if (Number.isFinite(t1 as number) && (t1 as number) > t0) {
    end = t1 as number;
  } else if (nextT0 != null && Number.isFinite(nextT0) && nextT0 > t0) {
    end = Math.min(nextT0 - 0.05, t0 + CLIP_FALLBACK_LEN);
  } else {
    end = t0 + CLIP_FALLBACK_LEN;
  }
  end = Math.min(end, t0 + CLIP_MAX_LEN); // 异常长戳收口
  const start = Math.max(0, t0 - CLIP_PAD_HEAD);
  return { start: Math.min(start, duration), end: Math.min(Math.max(0, duration), end + CLIP_PAD_TAIL) };
}

// 按秒区间切 PCM（返回拷贝，调用方可独立持有/播放）
export function slicePcm(pcm: Float32Array, sampleRate: number, span: Span): Float32Array {
  const a = Math.max(0, Math.floor(span.start * sampleRate));
  const b = Math.min(pcm.length, Math.ceil(span.end * sampleRate));
  if (b <= a) return new Float32Array(0);
  return pcm.slice(a, b);
}

// —— 播放器：模块级单例，同一时刻只播一个自录切片，可被 stopOwnClip 取消 ——
let ctx: AudioContext | null = null;
let src: AudioBufferSourceNode | null = null;
let playGen = 0;

export function stopOwnClip() {
  playGen++;
  if (src) { try { src.onended = null; src.stop(); } catch { /* noop */ } src = null; }
}

// 播放一段 16k 单声道 PCM；返回实际播放秒数（0 表示空切片/未播）
export function playPcm16k(pcm: Float32Array): number {
  if (!pcm.length) return 0;
  stopOwnClip();
  const gen = playGen;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // 录音就是 16k，直接用 16k 上下文（Chromium 会重采样到输出设备）
    ctx = new AC({ sampleRate: 16000 });
  }
  void ctx.resume();
  const buf = ctx.createBuffer(1, pcm.length, 16000);
  buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.connect(ctx.destination);
  src = node;
  node.onended = () => { if (gen === playGen && src === node) src = null; };
  node.start();
  return pcm.length / 16000;
}

// 便捷封装：整段 PCM + 词区间 → 切片播放
export function playWordClip(pcm: Float32Array, span: Span): number {
  return playPcm16k(slicePcm(pcm, 16000, span));
}
