// Whisper 8s log-mel 特征（从 spike smartturn-mel.py 逐行移植，chunk_length=8）。
// 输出 80×800 Float32（行主序）。正确性以 Python .feat 冻结特征为回归基线。
import { rfftMagSquared } from "./fft.ts";

export const SR = 16000;
const N_FFT = 400, HOP = 160, N_MELS = 80, SEC = 8;
const MAXN = SR * SEC;

function hzToMelSlaney(f: number): number {
  return f >= 1000 ? 15 + Math.log(f / 1000) / (Math.log(6.4) / 27) : f / (200 / 3);
}
function melToHzSlaney(m: number): number {
  return m >= 15 ? 1000 * Math.exp((m - 15) * (Math.log(6.4) / 27)) : m * (200 / 3);
}

function linspace(a: number, b: number, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / (n - 1);
  return out;
}

function melFilterbank(): Float32Array {
  const bins = N_FFT / 2 + 1;
  const fftfreqs = linspace(0, SR / 2, bins);
  const melEdges = linspace(hzToMelSlaney(0), hzToMelSlaney(SR / 2), N_MELS + 2).map(melToHzSlaney);
  const w = new Float32Array(N_MELS * bins);
  for (let i = 0; i < N_MELS; i++) {
    const l = melEdges[i], c = melEdges[i + 1], r = melEdges[i + 2];
    let enorm = 2 / (melEdges[i + 2] - melEdges[i]);
    for (let k = 0; k < bins; k++) {
      let v = Math.min((fftfreqs[k] - l) / (c - l), (r - fftfreqs[k]) / (r - c));
      if (v < 0) v = 0;
      w[i * bins + k] = v * enorm;
    }
  }
  return w;
}

const FB = melFilterbank();
const WIN = new Float64Array(N_FFT);
for (let i = 0; i < N_FFT; i++) WIN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT);

export function reflectPad(x: Float32Array, pad: number): Float64Array {
  const n = x.length;
  const out = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) out[i] = x[pad - i];
  for (let i = 0; i < n; i++) out[pad + i] = x[i];
  for (let j = 0; j < pad; j++) out[n + pad + j] = x[n - 2 - j];
  return out;
}

export function stftMag2(x: Float64Array): Float64Array {
  const n = x.length - 2 * (N_FFT / 2); // 去填充后的真实长度
  const nFrames = 1 + Math.floor(n / HOP);
  const bins = N_FFT / 2 + 1;
  const out = new Float64Array((nFrames - 1) * bins); // 丢最后一帧
  for (let t = 0; t < nFrames - 1; t++) {
    const frame = new Float64Array(N_FFT);
    const start = t * HOP;
    for (let i = 0; i < N_FFT; i++) frame[i] = x[start + i] * WIN[i];
    const mag = rfftMagSquared(frame);
    out.set(mag, t * bins);
  }
  return out;
}

export function prepareClip(pcmInput: Float32Array): Float64Array {
  let pcm = pcmInput;
  if (pcm.length > MAXN) pcm = pcm.slice(pcm.length - MAXN);
  let realStart = 0, realEnd = pcm.length;
  if (pcm.length < MAXN) {
    const padn = MAXN - pcm.length;
    const padded = new Float32Array(MAXN);
    padded.set(pcm, padn);
    pcm = padded;
    realStart = padn; realEnd = MAXN;
  }
  let mu = 0;
  for (let i = realStart; i < realEnd; i++) mu += pcm[i];
  mu /= realEnd - realStart;
  let varSum = 0;
  for (let i = realStart; i < realEnd; i++) varSum += (pcm[i] - mu) ** 2;
  const std = Math.sqrt(varSum / (realEnd - realStart) + 1e-5);
  const normed = new Float64Array(MAXN);
  for (let i = 0; i < MAXN; i++) normed[i] = (pcm[i] - mu) / std;
  return normed;
}

export function melFromMag(mag: Float64Array): Float32Array {
  const bins = N_FFT / 2 + 1;
  const frames = 800;
  const log = new Float32Array(N_MELS * frames);
  let globalMax = -Infinity;
  for (let m = 0; m < N_MELS; m++) {
    for (let t = 0; t < frames; t++) {
      let v = 0;
      const fOff = t * bins;
      for (let k = 0; k < bins; k++) v += FB[m * bins + k] * mag[fOff + k];
      const l = Math.log10(Math.max(v, 1e-10));
      log[m * frames + t] = l;
      if (l > globalMax) globalMax = l;
    }
  }
  // Whisper：全局地板 = 全矩阵 max - 8（不是逐行）
  const floor = globalMax - 8;
  for (let i = 0; i < log.length; i++) {
    let l = log[i];
    if (l < floor) l = floor;
    log[i] = (l + 4) / 4;
  }
  return log;
}

export function smartTurnMel(pcmInput: Float32Array): Float32Array {
  const normed = prepareClip(pcmInput);
  const padded = reflectPad(new Float32Array(normed), N_FFT / 2);
  const mag = stftMag2(padded);
  return melFromMag(mag);
}
