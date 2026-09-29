// S15-1 云端语法深度分析引擎：GLM（OpenAI 兼容）非流式 + response_format=json_object。
// 真机探测结论（2026-09-26，glm-4-flash）：
//   json_object 受支持（输出为可解析 JSON）；json_schema 被静默忽略；故采用
//   「json_object + 严格提示词 + Schema 校验 + quote 定位」，失败最多修复重试 1 次。
// 口径：score_est 为 0–100 模型估计；quote+occurrence 必须能映射回原文，映射不上丢弃。
import { api } from "../api";
import {
  fnv, extractJson, normalize, type GrammarAnalysis,
} from "./grammar-normalize";

export type { GrammarAnalysis, GrammarError, GrammarErrorType } from "./grammar-normalize";

export const GRAMMAR_PROMPT_VERSION = "g1";
export const GRAMMAR_SCHEMA_VERSION = "s1";

export type GrammarResult =
  | { ok: true; analysis: GrammarAnalysis; cached: boolean }
  | { ok: false; reason: string };

const SYSTEM_PROMPT = `You are an expert CET-6 / IELTS English grammar examiner. Analyze the user's English sentence(s) and return ONLY one JSON object, no markdown and no commentary, with this exact shape:
{
  "score_est": <integer 0-100, estimated overall grammar quality; 100 when there are no errors>,
  "rewritten": "<the original with ONLY the errors corrected, preserving the original meaning and style>",
  "native_tip": "<a more natural native version; may rephrase freely; empty string if the original is already natural>",
  "errors": [
    {
      "quote": "<exact substring copied verbatim from the original that contains the error>",
      "occurrence": <1-based index telling which occurrence of this substring in the original; default 1>,
      "type": "<one of: tense, agreement, article, preposition, word_order, collocation, mood, other>",
      "correct": "<corrected version of the quoted substring>",
      "rule_zh": "<one-sentence Chinese explanation of the rule>",
      "severity": "<error or warning>"
    }
  ]
}
Rules:
- If the sentence is correct, return an empty errors array and do NOT invent errors.
- "quote" MUST be an exact verbatim substring of the original text.
- Each distinct error gets one entry; do not repeat the same error twice.
- Output valid JSON only.`;

async function postJson(
  url: string, key: string, model: string, messages: { role: string; content: string }[],
): Promise<string> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, stream: false, temperature: 0.1, max_tokens: 900,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    const err = new Error(`cloud_http_${resp.status}`) as Error & { status: number; body: string };
    err.status = resp.status; err.body = body.slice(0, 400);
    throw err;
  }
  const j = await resp.json();
  return String(j?.choices?.[0]?.message?.content ?? "");
}

export async function analyzeGrammar(text: string, context = ""): Promise<GrammarResult> {
  const original = String(text ?? "").trim();
  if (!original) return { ok: false, reason: "empty_text" };

  const { consent } = await api.cloudGetConsent();
  if (!consent.grammarCloud) return { ok: false, reason: "grammar_consent_off" };
  const baseUrl = (consent.baseUrl || "").trim();
  const model = (consent.model || "").trim();
  if (!baseUrl || !model) return { ok: false, reason: "cloud_endpoint_missing" };
  const key = (await api.cloudGetKey()).trim();
  if (!key) return { ok: false, reason: "cloud_key_missing" };

  const cacheKey = "gram:" + fnv([
    original, context, baseUrl, model,
    GRAMMAR_PROMPT_VERSION, GRAMMAR_SCHEMA_VERSION,
  ].join("|"));
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const analysis = JSON.parse(cached) as GrammarAnalysis;
      return { ok: true, analysis, cached: true };
    }
  } catch { /* ignore */ }

  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const userContent =
    (context ? `Conversation context (for reference only):\n${context}\n\n` : "") +
    `Sentence(s) to analyze:\n${original}`;

  let content: string;
  try {
    content = await postJson(url, key, model, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ]);
  } catch (e) {
    const st = (e as { status?: number }).status;
    if (st && [429, 500, 502, 503, 504].includes(st)) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        content = await postJson(url, key, model, [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ]);
      } catch (e2) {
        return { ok: false, reason: String((e2 as Error).message || e2) };
      }
    } else {
      return { ok: false, reason: String((e as Error).message || e) };
    }
  }

  let parsed: unknown;
  try {
    parsed = extractJson(content);
  } catch {
    return { ok: false, reason: "bad_json" };
  }
  const normalized0 = normalize(parsed, original);

  // 最多修复重试 1 次
  let normalized = normalized0;
  if (normalized.problem) {
    try {
      const repaired = await postJson(url, key, model, [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
        { role: "assistant", content: String(content).slice(0, 800) },
        {
          role: "user",
          content: `Your previous output failed validation: ${normalized.problem}. Every "quote" must be an exact verbatim substring of the original sentence(s). Return ONLY the corrected JSON object.`,
        },
      ]);
      const n2 = normalize(extractJson(repaired), original);
      if (!n2.problem && n2.analysis) normalized = n2;
    } catch {
      /* fall through with failure */
    }
  }
  if (normalized.problem || !normalized.analysis) {
    return { ok: false, reason: "schema_failed:" + (normalized.problem ?? "null") };
  }

  const analysis: GrammarAnalysis = { ...normalized.analysis, model };
  try { localStorage.setItem(cacheKey, JSON.stringify(analysis)); } catch { /* ignore */ }
  return { ok: true, analysis, cached: false };
}
