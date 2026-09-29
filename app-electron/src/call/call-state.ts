// S14-1C：通话状态机纯函数层（无浏览器依赖，可单测）
// - 下行响应的文本/音频样本累积
// - 打断时按"已听到的音频比例"计算已播文本前缀（PCM 24kHz，时长精确）
// - 组装客户端权威 transcript（重连写入 session.instructions）

export type CallRole = "user" | "assistant";

export interface CallTurn {
  role: CallRole;
  text: string;
  status: "completed" | "interrupted";
}

export interface ResponseAccum {
  responseId: string;
  text: string;
  audioSamples: number; // 已收到的 int16 样本数（24kHz）
  done: boolean;
}

export type ResponseMap = Record<string, ResponseAccum>;

export function ensureResponse(map: ResponseMap, responseId: string): ResponseMap {
  if (map[responseId]) return map;
  return { ...map, [responseId]: { responseId, text: "", audioSamples: 0, done: false } };
}

export function withTextDelta(map: ResponseMap, responseId: string, delta: string): ResponseMap {
  const next = ensureResponse(map, responseId);
  const r = next[responseId];
  return { ...next, [responseId]: { ...r, text: r.text + delta } };
}

export function withAudioSamples(map: ResponseMap, responseId: string, addedSamples: number): ResponseMap {
  const next = ensureResponse(map, responseId);
  const r = next[responseId];
  return { ...next, [responseId]: { ...r, audioSamples: r.audioSamples + Math.max(0, addedSamples) } };
}

export function markDone(map: ResponseMap, responseId: string): ResponseMap {
  if (!map[responseId]) return map;
  const r = map[responseId];
  return { ...map, [responseId]: { ...r, done: true } };
}

// 按已听样本比例计算字符终点；吸附到词边界，避免把单词切成两半
export function heardCharEnd(text: string, heardSamples: number, totalSamples: number): number {
  if (!text) return 0;
  if (totalSamples <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, heardSamples / totalSamples));
  const raw = Math.floor(ratio * text.length);
  if (raw >= text.length) return text.length;
  if (raw <= 0) return 0;
  // 向前找最近空格（最多回退 16 字符），保证不断词
  const windowStart = Math.max(0, raw - 16);
  const slice = text.slice(windowStart, raw);
  const sp = slice.lastIndexOf(" ");
  if (sp >= 0) return windowStart + sp;
  return raw;
}

export function heardPrefix(text: string, heardSamples: number, totalSamples: number): string {
  return text.slice(0, heardCharEnd(text, heardSamples, totalSamples));
}

// 组装客户端权威 transcript（重连写入新连接 instructions）
export function buildContextTranscript(turns: CallTurn[]): string {
  const lines: string[] = [];
  for (const t of turns) {
    const who = t.role === "user" ? "User" : "Assistant";
    const text = t.text.trim();
    if (!text) continue;
    lines.push(`${who}: ${text}`);
  }
  return lines.join("\n");
}

// 裁剪到最大字符数：保留末尾内容，并在整行边界处下刀
export function trimTranscriptToChars(transcript: string, maxChars: number): string {
  if (transcript.length <= maxChars) return transcript;
  const tail = transcript.slice(transcript.length - maxChars);
  const nl = tail.indexOf("\n");
  return nl >= 0 ? tail.slice(nl + 1) : tail;
}

// 麦克风帧电平（Int16 → 0..1 RMS）
export function frameLevel(frame: Int16Array): number {
  if (!frame.length) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i] / 32768;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / frame.length) * 3);
}

// 打断后：把被打断的助手轮按已听前缀固化，其余轮原样保留；一个字都没听到则移除该轮
export function freezeTurnsWithHeardPrefix(
  turns: CallTurn[],
  heardSamples: number,
  totalSamples: number,
): CallTurn[] {
  if (!turns.length) return turns;
  const idx = turns.length - 1;
  const last = turns[idx];
  if (last.role !== "assistant") return turns;
  const prefix = heardPrefix(last.text, heardSamples, totalSamples);
  const out = turns.slice();
  if (!prefix) { out.pop(); return out; }
  out[idx] = { ...last, text: prefix, status: "interrupted" };
  return out;
}
