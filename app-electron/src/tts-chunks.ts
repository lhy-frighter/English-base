// 纯函数：TTS 朗读前的意群切分与停顿规划（无 DOM 依赖，可在 Node 单测中直接跑）。
// v2.8.1：按标点切意群 + 标点间插停顿；保护缩写/小数/千分位，避免误切。

const DOT = "\u0001"; // 受保护的句点占位
const COMMA = "\u0002"; // 受保护的逗号占位

// 已知头衔/缩写词后的句点（大小写不敏感）
const ABBREV_RE = /\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc|cf|al|No|Vol|Fig|Inc|Ltd|Eds?|pp?)\./g;
// 连续单字母点：U.S. / U.S.A. / e.g. / i.e. / a.m. / p.m.
const INITIALS_RE = /(?:[A-Za-z]\.){2,}/g;
// 小数 3.14
const DECIMAL_RE = /\d\.\d/g;
// 千分位 1,000 / 1,000,000
const THOUSANDS_RE = /\d,(?=\d{3}(?:\D|$))/g;

export function maskProtected(text: string): string {
  return text
    .replace(DECIMAL_RE, (m) => m.replace(".", DOT))
    .replace(THOUSANDS_RE, (m) => m.replace(",", COMMA))
    .replace(INITIALS_RE, (m) => m.replace(/\./g, DOT))
    .replace(ABBREV_RE, (m) => m.replace(/\.$/, DOT));
}

export function unmask(text: string): string {
  return text.replaceAll(DOT, ".").replaceAll(COMMA, ",");
}

export interface Clause {
  text: string;   // 实际送去合成的文本（已 trim、还原占位）
  raw: string;    // 切分后的原始片段（含尾部标点/换行，用于判定停顿）
  pause: number;  // 该段之后的停顿时长 ms
}

// 段尾标点 → 停顿时长（ms）：紧凑档（v2.39 耳听反馈：旧值偏慢、句中停顿过长）。
// 注意自然边界处 Kokoro 模型本身已带尾音静音，这里的数值是在模型尾音之外再追加的部分，
// 因此只补很短的间隙；逗号等句中边界尤其要小。
export function pauseAfter(raw: string): number {
  if (/\n\s*$/.test(raw)) return 340;
  if (/[.!?…]/.test(raw)) return 260;
  if (/[—–]/.test(raw)) return 150;
  if (/[,;:]/.test(raw)) return 100;
  return 0;
}

const MAX_UTT_CHARS = 240; // 单个 utterance 过长时按空格再切（Chromium 长文本保护）

// 超长无标点片段按空格切成 ≤MAX 的小块
function splitLong(text: string): string[] {
  if (text.length <= MAX_UTT_CHARS) return [text];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let buf = "";
  for (const w of words) {
    if (buf && (buf.length + 1 + w.length) > MAX_UTT_CHARS) { out.push(buf); buf = w; }
    else buf = buf ? buf + " " + w : w;
  }
  if (buf) out.push(buf);
  return out;
}

export function splitClauses(input: string): Clause[] {
  const masked = maskProtected(input);
  const parts = masked.match(/[^,.!?;:…—–\n]+[,.!?;:…—–]*\n?/g);
  if (!parts) return [];
  const clauses: Clause[] = [];
  for (const part of parts) {
    const pause = pauseAfter(part);
    const text = unmask(part).trim();
    if (!text) continue;
    const pieces = splitLong(text);
    pieces.forEach((piece, i) => {
      clauses.push({ text: piece, raw: part, pause: i === pieces.length - 1 ? pause : 0 });
    });
  }
  // 最后一段之后不需要停顿
  if (clauses.length) clauses[clauses.length - 1].pause = 0;
  return clauses;
}

// SAPI 句子级切分：只在句末标点（. ! ? …）与换行处断句；逗号/分号/冒号/破折号保留在
// 同一 utterance 内——系统语音本身会按逗号做自然韵律停顿，再切成独立 utterance 会重置
// 句子语调，听起来像"念清单"。Kokoro 神经 TTS 不受此限，播放管线仍用 splitClauses。
export function splitSentences(input: string): Clause[] {
  const masked = maskProtected(input);
  const parts = masked.match(/[^.!?…\n]+[.!?…]*\n?/g);
  if (!parts) return [];
  const clauses: Clause[] = [];
  for (const part of parts) {
    const pause = /\n\s*$/.test(part) ? 340 : /[.!?…]/.test(part) ? 240 : 0;
    const text = unmask(part).trim();
    if (!text) continue;
    const pieces = splitLongSentence(text);
    pieces.forEach((piece, i) => {
      clauses.push({ text: piece, raw: part, pause: i === pieces.length - 1 ? pause : 0 });
    });
  }
  if (clauses.length) clauses[clauses.length - 1].pause = 0;
  return clauses;
}

// 超长句优先在逗号/分号/冒号处断开（标点留在前一块），找不到再按空格切
function splitLongSentence(text: string): string[] {
  if (text.length <= MAX_UTT_CHARS) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_UTT_CHARS) {
    const window = rest.slice(0, MAX_UTT_CHARS);
    const marks = [...window.matchAll(/[,;:]\s*/g)];
    const lastMark = marks[marks.length - 1];
    let cut = -1;
    if (lastMark?.index !== undefined && lastMark.index > 40) cut = lastMark.index + 1;
    else {
      const sp = window.lastIndexOf(" ");
      if (sp > 40) cut = sp;
    }
    if (cut < 0) cut = MAX_UTT_CHARS;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export interface PlayChunk { text: string; pause: number; seamless?: boolean }

// 流式 TTS：从累计输出缓冲区中抽出已经完整的句子（句末标点/换行），返回未完成的残余。
// 缩写/小数的句点已被 maskProtected 占位，不会误断。
// restOffset：残余首字符在输入中的位置（mask/unmask 均长度不变），供游标精确定位；
// 不能用 length 相减——残余前的空白会让游标吃掉残余的首字母。
export function drainSentences(buffer: string): { ready: string[]; rest: string; restOffset: number } {
  const masked = maskProtected(buffer);
  const parts = masked.split(/(?<=[.!?…])[ \t]+|\r?\n+/);
  const ready: string[] = [];
  let rest = "";
  let restOffset = masked.length;
  let searchFrom = 0;
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k];
    const partOffset = masked.indexOf(part, searchFrom);
    searchFrom = partOffset + part.length;
    const t = unmask(part).trim();
    if (!t) continue;
    if (k === parts.length - 1 && !/[.!?…]\s*$/.test(part)) {
      rest = t;
      restOffset = partOffset + (part.length - part.trimStart().length);
    } else {
      ready.push(t);
    }
  }
  return { ready, rest, restOffset };
}

// 流式排程游标：只处理 drainedChars 之后的新增文本（LLM 流式只追加、前缀稳定），
// 返回本次需要入队的句子（含全文坐标 endOffset）与新的游标位置。
// isFinal 时把残余未完成句也入队。
export interface QueuedSentence {
  sentence: string;
  endOffset: number;
}
export function planStreamQueue(
  buffer: string,
  drainedChars: number,
  isFinal: boolean,
): { queue: QueuedSentence[]; newDrainedChars: number } {
  const start = Math.max(0, Math.min(drainedChars, buffer.length));
  const fresh = buffer.slice(start);
  const { ready, rest, restOffset } = drainSentences(fresh);
  let searchFrom = 0;
  const starts = ready.map((sentence) => {
    const idx = fresh.indexOf(sentence, searchFrom);
    searchFrom = idx + sentence.length;
    return idx;
  });
  const queue: QueuedSentence[] = [];
  ready.forEach((sentence, i) => {
    const localEnd = i < ready.length - 1 ? starts[i + 1] : rest ? restOffset : fresh.length;
    queue.push({ sentence, endOffset: start + localEnd });
  });
  let newDrainedChars = start + (rest ? restOffset : fresh.length);
  if (isFinal && rest.trim()) {
    queue.push({ sentence: rest.trim(), endOffset: buffer.length });
    newDrainedChars = buffer.length;
  }
  return { queue, newDrainedChars };
}

// 人类节奏原则（v2.40）：句内逗号/破折号处"要不要停、停多久、语调升降"是模型结合全句
// 语境产出的。人工把句子切成意群、逐块独立合成再拼接固定静音，会让每块都带上句终语调、
// 所有停顿千篇一律，听起来像"念清单"。因此除为首音延迟硬切的首块外，整句一次性合成，
// 把句内节奏完全交给模型；只在句与句之间补一个很短的间隙（由播放层按是否有下一句决定）。
function splitTailForLength(text: string): PlayChunk[] {
  const pieces = splitLongSentence(text); // 超长兜底：优先在逗号/分号处断开
  return pieces.map((piece, i) => ({
    text: piece,
    pause: 0,
    seamless: i < pieces.length - 1, // 句中安全切开的块裁掉模型尾音，保持连贯
  }));
}

// Kokoro 播放规划：首块 ≤ firstMaxWords 词（硬切、seamless 裁尾，保证首音延迟），
// 之后整句其余部分一次性合成，保留模型对句内标点与语调的自然处理。
export function planKokoroChunks(input: string, firstMaxWords = 6): PlayChunk[] {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  const out: PlayChunk[] = [];
  if (words.length <= firstMaxWords) {
    out.push({ text, pause: 0 });
  } else {
    const head = words.slice(0, firstMaxWords).join(" ");
    out.push({ text: head, pause: 0, seamless: true });
    const tail = text.slice(head.length).trim();
    if (tail) out.push(...splitTailForLength(tail));
  }
  return out;
}

// CJK 字符范围（中文澄清句等）：英文 TTS 无法朗读，整句跳过
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

// 流式 TTS 喂入前过滤：按句/换行切分，含中日韩字符的片段整段不送 TTS，
// 保证「中文澄清问题」只显示、不被英文语音念出。
export function ttsSafeText(text: string): string {
  if (!text) return "";
  const parts = text.split(/(?<=[.!?。！？])\s+|\n+/g);
  return parts.filter((seg) => !CJK_RE.test(seg)).join(" ").replace(/\s+/g, " ").trim();
}
