// 语音回归集：渲染层指标与存取辅助。英文样本复用跟读对齐算命中率/WER；中文/混说看 CJK 占比与幻觉。
import { api, type RegressionClip, type RegressionEval, type RegressionLang } from "./api";
import { alignRead } from "./shadow/align";
import { decodeToPcm16k } from "./shadow/audio";
import { AsrService, type AsrResult } from "./asr/asr";

// 跟读台/语音页采集当前默认走 base（真人回归集裁决后升档）；回归面板可另选已装模型重跑
export const CURRENT_MODEL = "whisper-base";

// 回归评测用**独立** ASR 实例（独立 Worker）：批量评测切模型不得改变生产单例 asr 的档位，
// 否则会出现"tiny 实际转写、样本却标 base"的身份污染。评测完应 disposeEval() 释放模型显存。
const evalAsr = new AsrService();

const CJK = /[一-鿿]/g;
const HALLUC = /^\s*(\[?\s*(music|playing|applause|silence|thank you|thanks for watching|speaking in foreign language|inaudible|blissful silence)\b[^\]]*\]?[\s,.-]*)+$/i;

// 由识别结果 + 参考文本计算评测指标。中文样本不算英文对齐（sim/wer 留 null）
export function summarize(lang: RegressionLang, ref: string, r: AsrResult): RegressionEval {
  const cjk = (r.text.match(CJK) || []).length;
  const letters = (r.text.match(/[A-Za-z]/g) || []).length;
  const cjkRatio = cjk + letters ? +(cjk / (cjk + letters)).toFixed(3) : 0;
  let sim: number | null = null, wer: number | null = null;
  let misses = 0, subs = 0, extras = 0;
  if (lang !== "zh" && ref.trim()) {
    const a = alignRead(ref, r.words);
    sim = Math.round(a.similarity * 100);
    misses = a.misses.length; subs = a.subs.length; extras = a.extras.length;
    wer = a.refCount ? +((misses + subs + extras) / a.refCount).toFixed(3) : null;
  }
  return {
    at: Date.now(), ms: r.ms, text: r.text,
    sim, wer, misses, subs, extras, cjkRatio,
    hallucinated: HALLUC.test(r.text),
  };
}

export async function saveClip(p: {
  blob: Blob; lang: RegressionLang; ref: string; source: "shadow" | "voice";
  hyp: string; ms: number; model: string;
}): Promise<RegressionClip> {
  const bytes = await p.blob.arrayBuffer();
  return api.regressionSave({
    lang: p.lang, ref: p.ref, source: p.source, hyp: p.hyp, ms: p.ms,
    model: p.model, mime: p.blob.type || "audio/webm", bytes,
  });
}

export async function listClips(): Promise<RegressionClip[]> {
  return api.regressionList();
}

// 用指定模型对单条样本重跑并持久化结果（多语模型按样本语言给 language；混说自动检测）
export async function evalClip(clip: RegressionClip, model: string): Promise<RegressionEval> {
  const loaded = await api.regressionRead(clip.id);
  const ab = loaded.bytes.slice().buffer as ArrayBuffer;
  const blob = new Blob([ab], { type: loaded.mime });
  const pcm = await decodeToPcm16k(blob);
  await evalAsr.init("wasm", model);
  const language = clip.lang === "zh" ? "chinese" : clip.lang === "en" ? "english" : undefined;
  const r = await evalAsr.transcribe(pcm, language ? { language } : undefined);
  const ev = summarize(clip.lang, clip.ref, r);
  await api.regressionSetEval({ id: clip.id, model, result: ev });
  return ev;
}

// 批量评测结束后释放评测专用 Worker/模型（不影响生产跟读单例）
export async function disposeEval(): Promise<void> {
  await evalAsr.dispose();
}
