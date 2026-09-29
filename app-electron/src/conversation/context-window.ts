// V8-2c 上下文管理：cs1k（约 1024 token）内按 token 预算选取最近原始轮次，
// 超出预算的旧轮次压缩成运行摘要。摘要只作提示上下文，不是学习事实源：
// 原始轮次、纠错、成卡证据永远以 conversation_turns 为准，不被摘要覆盖。
export type ChatMsg = { role: string; content: string };

export const CTX_TOTAL_TOKENS = 1024; // cs1k 上下文窗口
export const RESERVE_OUTPUT_TOKENS = 260; // maxTokens 220 + 纠错行余量
export const RESERVE_SYSTEM_TOKENS = 220; // system prompt + 摘要块
export const HISTORY_TOKEN_BUDGET =
  CTX_TOTAL_TOKENS - RESERVE_OUTPUT_TOKENS - RESERVE_SYSTEM_TOKENS;

// 粗估 token：CJK 字符约 1 token，其余按 4 字符/token（英文经验值）。
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x4e00 && code <= 0x9fff) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

// 从最新一条往回选，直到累计 token 达到预算；保持时间顺序返回。
// 最新一条（用户刚发的话）即使超长也一定保留。
export function selectWindow(
  turns: ChatMsg[],
  budget: number = HISTORY_TOKEN_BUDGET,
): { window: ChatMsg[]; overflow: ChatMsg[] } {
  let used = 0;
  let cut = turns.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = estimateTokens(turns[i].content) + 4; // 每条消息约 4 token 模板开销
    if (used + cost > budget) {
      cut = i < turns.length - 1 ? i + 1 : i;
      break;
    }
    used += cost;
    cut = i;
  }
  return { window: turns.slice(cut), overflow: turns.slice(0, cut) };
}

export function windowTokens(turns: ChatMsg[]): number {
  return turns.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
}

export const SUMMARY_SYSTEM_PROMPT =
  "You compress older conversation history for context. " +
  "Using the prior summary (if any) and the older messages, output at most 8 short English bullets: " +
  "key facts, decisions, and the learner's recurring grammar or word-choice mistakes. " +
  "Keep it under 120 words. Output bullets only, no small talk.";

export function summaryUserMessage(prevSummary: string, overflow: ChatMsg[]): string {
  const lines = overflow.map((m) => `${m.role}: ${m.content}`).join("\n");
  return `Prior summary:\n${prevSummary || "(none)"}\n\nOlder messages:\n${lines}`;
}
