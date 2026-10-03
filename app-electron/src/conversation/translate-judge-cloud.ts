// src/conversation/translate-judge-cloud.ts — 翻译批改的云端层（#205 第③层）
//
// 分层职责严格划开：
//   第①②层（本地，见 translate-judge.ts）零成本、离线、每次都出结果；
//   第③层（这里）**只在本地判定有错时才调用**——既省时也省钱，
//   而且「翻译对了还要看语法分析」对用户没有价值。
//
// 授权：复用既有的 consent.grammarCloud（「文本送云端做语法深度分析」），
// 不新增授权项——用户此前勾选时授权的语义就包含这件事。
// Key：沿用 grammar-engine 的取法（api.cloudGetKey，主进程经 Windows 密钥链解密），
// 绝不在渲染层落盘。
import { api } from "../api";
import { compare, buildDeepPrompt, type JudgeResult } from "../translate-judge";

export interface DeepResult {
  ok: boolean;
  reason?: string;
  verdict: string;        // 模型给的总体判定原文
  points: string[];       // 实质错误 / 语法要点 / 表达建议
  memoryTip: string;      // 一句话记忆点
  local: JudgeResult;     // 本地判定，UI 始终展示
}

const SYSTEM = "你是一位严谨但克制的英译中批改老师。";

async function postJson(url: string, key: string, model: string,
  messages: { role: string; content: string }[]): Promise<string> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, stream: false, temperature: 0.2, max_tokens: 1200,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!resp.ok) throw new Error(`cloud_http_${resp.status}`);
  const j = await resp.json();
  return String(j?.choices?.[0]?.message?.content ?? "");
}

/** 第③层入口。本地无错时直接短路返回，不发任何请求。 */
export async function deepJudge(
  referenceEn: string, reference: string, user: string,
): Promise<DeepResult> {
  const local = compare(reference, user);
  if (!local.needsDeep) {
    return { ok: true, verdict: "正确", points: [], memoryTip: "", local };
  }
  const { consent } = await api.cloudGetConsent();
  if (!consent.grammarCloud) return { ok: false, reason: "grammar_consent_off", verdict: "", points: [], memoryTip: "", local };
  const baseUrl = String(consent.baseUrl || "").replace(/\/+$/, "");
  const model = String(consent.model || "");
  if (!baseUrl || !model) return { ok: false, reason: "cloud_endpoint_missing", verdict: "", points: [], memoryTip: "", local };
  const key = (await api.cloudGetKey()).trim();
  if (!key) return { ok: false, reason: "cloud_key_missing", verdict: "", points: [], memoryTip: "", local };

  const prompt = buildDeepPrompt(referenceEn, reference, user, local);
  try {
    const raw = await postJson(baseUrl + "/chat/completions", key, model, [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ]);
    const j = JSON.parse(raw);
    const pick = (v: unknown): string[] =>
      Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : v ? [String(v)] : [];
    return {
      ok: true,
      verdict: String(j.verdict ?? j.判定 ?? ""),
      points: [...pick(j.errors), ...pick(j.grammar), ...pick(j.suggestions)],
      memoryTip: String(j.memory ?? j.memoryTip ?? ""),
      local,
    };
  } catch (e) {
    return { ok: false, reason: String((e as Error)?.message || e), verdict: "", points: [], memoryTip: "", local };
  }
}