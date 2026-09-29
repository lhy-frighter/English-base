// S15-1 语法分析纯逻辑层（无浏览器/网络依赖，可被 Node --experimental-strip-types 直接测试）。
export type GrammarErrorType =
  | "tense" | "agreement" | "article" | "preposition"
  | "word_order" | "collocation" | "mood" | "other";

export interface GrammarError {
  quote: string;
  occurrence: number;
  type: GrammarErrorType;
  correct: string;
  rule_zh: string;
  severity: "error" | "warning";
  locatable: boolean;
}

export interface GrammarAnalysis {
  score_est: number;
  rewritten: string;
  native_tip: string;
  errors: GrammarError[];
  dropped: number;
  model: string;
}

// —— 轻量 hash（FNV-1a 32bit → base36），仅用于缓存键 ——
export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const TYPE_MAP: Record<string, GrammarErrorType> = {
  tense: "tense", "verb tense": "tense", "tense consistency": "tense",
  agreement: "agreement", "subject-verb agreement": "agreement",
  "subject verb agreement": "agreement", "agreement/subject-verb": "agreement",
  article: "article", articles: "article", "article usage": "article",
  preposition: "preposition", prepositions: "preposition",
  "word order": "word_order", word_order: "word_order",
  collocation: "collocation", "word choice": "collocation", usage: "collocation",
  mood: "mood", modal: "mood", "verb form": "tense",
};

export function normalizeType(t: unknown): GrammarErrorType {
  const key = String(t ?? "").toLowerCase().trim();
  return TYPE_MAP[key] ?? "other";
}

// quote 第 occurrence 次出现是否存在于原文（occurrence 为 1-based）
export function locateQuote(original: string, quote: string, occurrence: number): boolean {
  if (!quote) return false;
  const n = Math.max(1, Math.floor(occurrence) || 1);
  let from = 0;
  let idx = -1;
  for (let i = 0; i < n; i++) {
    idx = original.indexOf(quote, from);
    if (idx === -1) return false;
    from = idx + quote.length;
  }
  return true;
}

// 从模型输出中提取 JSON（防御 markdown fence / 前后多余文字）
export function extractJson(raw: string): unknown {
  let t = String(raw ?? "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a === -1 || b <= a) throw new Error("no_json_object");
  return JSON.parse(t.slice(a, b + 1));
}

export function normalize(raw: unknown, original: string): {
  analysis: Omit<GrammarAnalysis, "model"> | null;
  problem: string | null;
} {
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== "object") return { analysis: null, problem: "not_object" };
  const errorsRaw = Array.isArray(o.errors) ? o.errors : null;
  if (!errorsRaw) return { analysis: null, problem: "errors_not_array" };

  const seen = new Set<string>();
  const errors: GrammarError[] = [];
  let dropped = 0;
  for (const item of Object.values(errorsRaw)) {
    const e = item as Record<string, unknown>;
    if (!e || typeof e !== "object") { dropped++; continue; }
    const quote = String(e.quote ?? "").trim();
    const correct = String(e.correct ?? "").trim();
    const ruleZh = String(e.rule_zh ?? e.rule ?? "").trim();
    if (!quote || !correct || !ruleZh) { dropped++; continue; }
    let occurrence = Math.floor(Number(e.occurrence)) || 1;
    let locatable = locateQuote(original, quote, occurrence);
    if (!locatable && occurrence !== 1) {
      occurrence = 1;
      locatable = locateQuote(original, quote, 1);
    }
    if (!locatable) { dropped++; continue; }
    const dedupKey = quote + "|" + correct;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const sev = String(e.severity ?? "").toLowerCase() === "warning" ? "warning" : "error";
    errors.push({
      quote, occurrence, type: normalizeType(e.type),
      correct, rule_zh: ruleZh, severity: sev, locatable,
    });
  }

  let score = Math.floor(Number(o.score_est));
  if (!Number.isFinite(score)) score = errors.length ? 70 : 95;
  score = Math.max(0, Math.min(100, score));
  const rewritten = String(o.rewritten ?? "").trim();
  const nativeTip = String(o.native_tip ?? "").trim();

  return {
    analysis: {
      score_est: score, rewritten, native_tip: nativeTip,
      errors, dropped,
    },
    problem: errors.length === 0 && dropped > 0 ? "all_errors_dropped" : null,
  };
}
