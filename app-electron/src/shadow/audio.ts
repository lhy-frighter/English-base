// 录音解码共享工具：任意浏览器录音 Blob → 16k 单声道 PCM（Whisper 输入）。
// 注意（P1 记账）：当前链路 MediaRecorder(webm/opus) → decodeAudioData 解码再重采样，
// 存在编码/解码延迟；跟读台开工后若实测影响节奏对齐，改用 AudioWorklet 直采 PCM。
export async function decodeToPcm16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const tmp = new AC();
  const decoded = await tmp.decodeAudioData(buf);
  tmp.close();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0).slice();
}
