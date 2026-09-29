// teach-parse：TEACH 尾块解析（V9 §4.2）
// 可见英文正文 + 严格尾块 [TEACH: {...}]；解析器只处理模型回复（调用方负责，用户输入不解析）。
export interface TeachPair {
  en: string;
  zh: string;
}
export interface TeachGrammarPoint {
  structure: string;
  note: string;
}
export interface TeachPayload {
  en: string;
  zh: string;
  chunks: TeachPair[];
  words: TeachPair[];
  grammar: TeachGrammarPoint[];
}
export interface SplitResult {
  visible: string;
  teach: TeachPayload | null;
  dangling: boolean; // 尾块未闭合（流式中）
}

const MARKER = "[TEACH:";

function normText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asPairs(v: unknown): TeachPair[] {
  if (!Array.isArray(v)) throw new Error("not array");
  return v.map((it) => {
    if (!it || typeof it !== "object") throw new Error("bad item");
    const en = String((it as Record<string, unknown>).en || "").trim();
    const zh = String((it as Record<string, unknown>).zh || "").trim();
    if (!en) throw new Error("pair missing en");
    return { en, zh };
  });
}

function asGrammar(v: unknown): TeachGrammarPoint[] {
  if (!Array.isArray(v)) throw new Error("not array");
  return v.map((it) => {
    if (!it || typeof it !== "object") throw new Error("bad item");
    const structure = String((it as Record<string, unknown>).structure || "").trim();
    const note = String((it as Record<string, unknown>).note || "").trim();
    if (!structure) throw new Error("grammar missing structure");
    return { structure, note };
  });
}

// 严格解析 JSON 尾块内容；任何字段非法都抛错
export function parseTeach(jsonText: string): TeachPayload {
  const obj = JSON.parse(jsonText) as Record<string, unknown>;
  const en = String(obj.en || "").trim();
  const zh = String(obj.zh || "").trim();
  if (!en || !zh) throw new Error("missing en/zh");
  const chunks = asPairs(obj.chunks ?? []);
  const words = asPairs(obj.words ?? []);
  const grammar = asGrammar(obj.grammar ?? []);
  return { en, zh, chunks, words, grammar };
}

// TEACH.en 必须与可见回复对应：规范化后 en 是 visible 的子串（或反之）
export function teachMatchesVisible(teach: TeachPayload, visible: string): boolean {
  const en = normText(teach.en);
  const vis = normText(visible);
  if (!en || !vis) return false;
  return vis.includes(en) || en.includes(vis);
}

// 流式展示用：返回去掉 TEACH 尾块（含未闭合）后的可见文本
export function visibleOfStream(full: string): string {
  const idx = String(full || "").lastIndexOf(MARKER);
  if (idx < 0) return full;
  return full.slice(0, idx).replace(/\s+$/, "");
}

// TTS feed 用：仅裁掉标记及其后内容，保留尾部空白（保证累计游标单调）
export function stripTeachRaw(full: string): string {
  const idx = String(full || "").lastIndexOf(MARKER);
  if (idx < 0) return full;
  return full.slice(0, idx);
}

// 完整拆分：尾块必须位于回复末尾（其后只允许空白）；重复块、截断、坏 JSON、字段非法 → teach=null
export function splitTeach(full: string): SplitResult {
  const text = String(full || "");
  const firstIdx = text.indexOf(MARKER);
  if (firstIdx < 0) return { visible: text.trim(), teach: null, dangling: false };
  const lastIdx = text.lastIndexOf(MARKER);
  const visibleRaw = text.slice(0, lastIdx);
  // 出现两个及以上标记 → 视为重复/异常，整块丢弃
  if (firstIdx !== lastIdx) {
    return { visible: visibleRaw.trim(), teach: null, dangling: false };
  }
  const after = text.slice(lastIdx + MARKER.length);
  const closeIdx = after.lastIndexOf("]");
  if (closeIdx < 0) {
    // 未闭合：流式中。允许标记后出现 JSON 前缀，但不得有内容在 ] 之后
    return { visible: visibleRaw.replace(/\s+$/, ""), teach: null, dangling: true };
  }
  const tail = after.slice(closeIdx + 1).trim();
  if (tail.length > 0) {
    // 尾块不在末尾 → 不解析
    return { visible: text.trim(), teach: null, dangling: false };
  }
  const jsonText = after.slice(0, closeIdx).trim();
  let teach: TeachPayload | null = null;
  try {
    teach = parseTeach(jsonText);
  } catch {
    teach = null;
  }
  if (teach && !teachMatchesVisible(teach, visibleRaw)) teach = null;
  return { visible: visibleRaw.replace(/\s+$/, "").trim(), teach, dangling: false };
}
