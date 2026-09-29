// 一键送跟读的纯逻辑（无 React/DOM 依赖，可单测）。
// 抽出来是为了让"重复发送 nonce 唯一、译文句对可靠匹配、听力按钮不触发 seek"这些接线正确性可被单测覆盖。

export type Pair = [string, string]; // [英文句, 中文句]

// nonce 自增工厂：Date.now() 同毫秒重复送同一句会撞值，计数器严格递增
export function createNonce(): () => number {
  let n = 0;
  return () => ++n;
}

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// 选区必须落在同一个英文段落（anchor/focus 的 data-pi 相同），否则视为跨段反选，不给译文
export function sameParagraph(anchorPi: string | null, focusPi: string | null): string | null {
  if (anchorPi != null && anchorPi === focusPi) return anchorPi;
  return null;
}

/**
 * 可靠句对匹配：弃用"首词包含"（the/a/it 等会经常误中本段第一句）。
 * 规则：归一化后的整段选区必须是某句英文的连续子串；多句命中时取最短（最具体）的那句；找不到返回 -1。
 * 这样反向选择（toString 仍是视觉顺序）、跨句选择都不会错配。
 */
export function pickPairIndex(pairs: Pair[], selected: string): number {
  const s = norm(selected);
  if (!s || pairs.length === 0) return -1;
  let hit = -1; let hitLen = Infinity;
  for (let i = 0; i < pairs.length; i++) {
    const en = norm(pairs[i][0]);
    if (en && en.includes(s) && en.length < hitLen) { hit = i; hitLen = en.length; }
  }
  return hit;
}

// 听力字幕"跟读"按钮：阻止冒泡到 cue 的 onClick（否则会同时 seek 音频），再送出
export function cueSend(e: { stopPropagation: () => void }, text: string, onSend: (t: string) => void): void {
  e.stopPropagation();
  onSend(text);
}

// 中译开启时中文 .zh-para 也位于 p[data-pi] 内；选区任一端点落在中文段，即视为中文/中英混合，
// 不能作为英文目标句送跟读台。两端是否在 .zh-para 由 DOM 侧 closest 判定后传入。
export function isChineseSelection(anchorInZhPara: boolean, focusInZhPara: boolean): boolean {
  return anchorInZhPara || focusInZhPara;
}
