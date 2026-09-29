// V8-3 语音输入采集：getUserMedia + MediaRecorder，停止后解码为 16k PCM（Whisper 输入）。
// 已知边界（P1 记账）：MediaRecorder 编码 + decodeAudioData 存在延迟，若真机实测影响
// 松键→转写延迟，改用 AudioWorklet 直采 PCM。
import { decodeToPcm16k } from "../shadow/audio";

export interface VoiceCapture {
  stop: () => Promise<{ pcm: Float32Array; blob: Blob; durationMs: number }>;
}

export async function startCapture(): Promise<VoiceCapture> {
  const startedAt = performance.now();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mr = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((resolve) => { mr.onstop = () => resolve(); });
  mr.start();
  return {
    async stop() {
      if (mr.state !== "inactive") mr.stop();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      const pcm = await decodeToPcm16k(blob);
      return { pcm, blob, durationMs: performance.now() - startedAt };
    },
  };
}
