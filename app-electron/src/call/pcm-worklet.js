// S14-1C：麦克风直采 PCM Worklet
// - 输入：AudioContext 默认采样率（通常 48kHz）单声道
// - 输出：16kHz、Int16、每帧 2048 样本（128ms），postMessage 可转移 ArrayBuffer
// - 线性插值重采样；连续帧含静音（Server VAD 要求持续 WAV 帧）
const TARGET_RATE = 16000;
const FRAME_SAMPLES = 2048;

class PcmStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / TARGET_RATE; // 全局 sampleRate；每输出一样本前进的源样本数
    this.srcPos = 0;   // 块内起始位置（跨块连续）
    this.frame = new Int16Array(FRAME_SAMPLES);
    this.n = 0;
  }

  pushSample(v) {
    const s = Math.max(-1, Math.min(1, v));
    this.frame[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    if (this.n === FRAME_SAMPLES) {
      const out = this.frame;
      this.frame = new Int16Array(FRAME_SAMPLES);
      this.port.postMessage(out, [out.buffer]);
      this.n = 0;
    }
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const len = ch.length;
    let pos = this.srcPos;
    // 落在 [0, len) 内的目标样本用线性插值；恰在边界的样本归下一块
    while (pos < len) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = ch[i];
      const b = i + 1 < len ? ch[i + 1] : a;
      this.pushSample(a + (b - a) * frac);
      pos += this.step;
    }
    this.srcPos = pos - len;
    return true;
  }
}

registerProcessor("pcm-stream", PcmStreamProcessor);
