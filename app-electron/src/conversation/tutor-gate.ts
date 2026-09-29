// tutor-gate：本地输入闸门（V9 §4.1）
// 只拦截：空内容、/ 或 ! 开头的命令、代码围栏、符号噪声；短中文一律放行（交 LLM 裁决）。
export type TutorMode = "auto" | "teach" | "chat";
export type GateResult = { ok: true } | { ok: false; reason: string };

const WORD_CHAR_RE = /[A-Za-z\u4e00-\u9fff]/g;

export function tutorGate(raw: string): GateResult {
  const text = String(raw ?? "");
  const t = text.trim();
  if (!t) return { ok: false, reason: "内容为空" };
  if (t.startsWith("/") || t.startsWith("!")) {
    return { ok: false, reason: "命令类内容不发送给 AI" };
  }
  if (/```/.test(t)) return { ok: false, reason: "代码内容不发送给 AI" };
  const wordChars = (t.match(WORD_CHAR_RE) || []).length;
  const noiseChars = t.replace(/[A-Za-z\u4e00-\u9fff0-9\s]/g, "").length;
  if (wordChars < 2 && noiseChars >= Math.max(1, wordChars)) {
    return { ok: false, reason: "符号噪声，不像学习内容" };
  }
  return { ok: true };
}
