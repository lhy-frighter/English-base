// src/translate-judge.ts — 翻译批改三层（#205）
//
// 用户需求：句子加入复习后，手写翻译 → ① 逐字对比 → ② 语义比较 → ③ 云端 AI 语法剖析。
// 三层的设计取舍（grill-me 定案）：
//
//   ① 逐字对比只在「明显偏离」时才报红。理由：正确翻译若逐词都有差异提示，
//      等于全程红字，用户会学会忽略它——比不报更糟。触发条件：
//      相似度 < 0.90 或逐词差异 ≥ 2 处（阈值收紧的理由见 compare 内注释）。
//   ② 本地相似度 + 差异标注始终给出（成本为零），作为第一层反馈。
//   ③ 云端 AI 剖析**只在有错时**才调。既省时又省钱，且「没错的时候看语法分析」
//      对用户没有价值。是否真的发请求由调用方决定。
//
// 纯逻辑、无 DOM 依赖，便于单测；相似度用词级 LCS（不是字符级），
// 因为中文按字比会把「意思对但换词」判得更糟，而词级能识别同义替换。

export interface DiffToken {
  op: "same" | "diff" | "miss" | "extra";
  a: string; // 参考译文侧
  b: string; // 用户译文侧
}

export interface JudgeResult {
  similarity: number; // 0~1
  diffCount: number; // 逐词差异处数
  verdict: "correct" | "minor" | "wrong";
  tokens: DiffToken[];
  needsDeep: boolean; // 是否值得调云端 AI
  reason: string;
}

const CJK = /[一-鿿぀-ヿ]/;

/** 词级切分：英文与数字整体成词，连续 CJK 逐字切（中文没有词边界，逐字比对最稳）。 */
export function segment(s: string): string[] {
  const out: string[] = [];
  for (const chunk of String(s || "").split(/[\s,.;:!?'"()[\]{}，。；：！？、（）「」《》…—\-/]+/)) {
    if (!chunk) continue;
    let buf = "";
    for (const ch of chunk) {
      if (CJK.test(ch)) {
        if (buf) { out.push(buf); buf = ""; }
        out.push(ch);
      } else buf += ch;
    }
    if (buf) out.push(buf);
  }
  return out;
}

/** 词级 LCS 相似度 + 对齐后的差异序列。 */
export function compare(reference: string, user: string): JudgeResult {
  const a = segment(reference);
  const b = segment(user);
  if (a.length === 0 && b.length === 0) {
    return { similarity: 1, diffCount: 0, verdict: "correct", tokens: [], needsDeep: false, reason: "两侧均为空" };
  }
  if (a.length === 0 || b.length === 0) {
    return {
      similarity: 0, diffCount: Math.max(a.length, b.length), verdict: "wrong",
      tokens: [{ op: a.length === 0 ? "extra" : "miss", a: a.join(""), b: b.join("") }],
      needsDeep: true, reason: a.length === 0 ? "没有作答" : "参考译文为空",
    };
  }

  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const similarity = dp[m][n] / Math.max(m, n);

  const tokens: DiffToken[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { tokens.unshift({ op: "same", a: a[i - 1], b: b[j - 1] }); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { tokens.unshift({ op: "miss", a: a[i - 1], b: "" }); i--; }
    else { tokens.unshift({ op: "extra", a: "", b: b[j - 1] }); j--; }
  }
  while (i > 0) { tokens.unshift({ op: "miss", a: a[i - 1], b: "" }); i--; }
  while (j > 0) { tokens.unshift({ op: "extra", a: "", b: b[j - 1] }); j--; }

  let diffCount = 0;
  for (const t of tokens) if (t.op !== "same") diffCount++;

  // 定案阈值：相似度 < 0.90 或差异 ≥2 处才算「明显偏离」。
  // 为什么从 0.85 收到 0.90：词级 LCS 看不见词义，「昨天→明天」这类语义反转
  // 相似度仍有 0.86，会被放过去——而逐字对比的职责上限就在这里，这类错误
  // 只能靠云端语义层抓。可一旦放过去，第③层就永远不会被触发，定案里
  // 「有错才调云端」的前提也就不成立了。所以门禁必须放行，宁可多送一次云端。
  const bad = similarity < 0.90 || diffCount >= 2;
  const verdict: JudgeResult["verdict"] = !bad ? "correct" : similarity >= 0.6 ? "minor" : "wrong";
  const reason = !bad ? "逐词一致" : `相似度 ${(similarity * 100).toFixed(0)}%，${diffCount} 处差异`;
  return { similarity, diffCount, verdict, tokens, needsDeep: verdict !== "correct", reason };
}

/** 组装给云端模型的提示：只送差异段 + 上下文，避免整篇重发。 */
export function buildDeepPrompt(referenceEn: string, reference: string, user: string, r: JudgeResult): string {
  const diffs = r.tokens.filter((t) => t.op !== "same").slice(0, 40)
    .map((t) => (t.op === "miss" ? `缺「${t.a}」` : t.op === "extra" ? `多「${t.b}」` : `「${t.a}」→「${t.b}」`))
    .join("；");
  return [
    "你在给中文母语者批改英译中。只指出真正的错误，不要为同义替换、语序调整、标点风格吹毛求疵。",
    "",
    `英文原句：${referenceEn}`,
    `参考译文：${reference}`,
    `用户译文：${user}`,
    `本地逐字比对：相似度 ${(r.similarity * 100).toFixed(0)}%，差异 ${r.diffCount} 处`,
    `差异位置：${diffs}`,
    "",
    "请按此结构回答（可为空则省略）：",
    "1. 总体判定：正确 / 语义对但表达欠佳 / 有实质错误",
    "2. 实质错误逐条：错在哪、为什么错、正确说法",
    "3. 语法层面剖析：时态/主谓一致/冠词/介词/从句等具体点（面向中级学习者）",
    "4. 更地道的表达建议（若译文可接受，只给润色建议而非纠错）",
    "5. 一句话总结记忆点",
  ].join("\n");
}