// S7b 阅读器机翻编排辅助：段落切分（必须与阅读器 data-pi 切分口径一致）、
// 源文 SHA-256（与主进程 text_translations.source_sha256 同一算法）、句对规整。
import type { Annotated, Token } from "../api";

// 与 App.tsx 阅读器渲染同一切分：punct token 文本含 \n 即换段，空段丢弃
export function tokenParagraphs(ann: Annotated): Token[][] {
  const groups: Token[][] = [[]];
  for (const tk of ann.tokens) {
    if (tk.label === "punct" && tk.text.includes("\n")) {
      if (groups[groups.length - 1].length) groups.push([]);
      continue;
    }
    groups[groups.length - 1].push(tk);
  }
  while (groups.length && !groups[groups.length - 1].length) groups.pop();
  return groups;
}

// 段落实体原文：用 token 在 raw_text 里的 start/end 区间切片，保证与 data-pi 索引一一对应
export function paragraphsFromAnn(ann: Annotated, rawText: string): string[] {
  return tokenParagraphs(ann).map((g) => {
    const first = g[0];
    const last = g[g.length - 1];
    return rawText.slice(first.start, last.start + last.text.length).trim();
  });
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Worker 句对 {src,tgt} → 存储/展示用 [src,tgt]；
// 引擎合并短句时 tgt 为空（译文并入上一句），回落到上一非空译句，再不行用整段译文
export function normalizePairs(pairs: { src: string; tgt: string }[], zhPara: string): [string, string][] {
  let lastTgt = "";
  return pairs.map((p) => {
    const tgt = p.tgt?.trim() ? p.tgt : (lastTgt || zhPara);
    if (p.tgt?.trim()) lastTgt = p.tgt;
    return [p.src, tgt] as [string, string];
  });
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
