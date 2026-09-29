// 跟读比对（V6，方案 §19.3 / ADR-3）：把"参考句"与 Whisper 转写的"实际读音词序列"做词级对齐，
// 只产出【漏词 / 疑似替换 / 多读 / 节奏位置】+ 句级相似度。
// 铁律：Whisper 词级时间戳是注意力/DTW 估算、非强制对齐；因此
//  - 不做音素级发音判定；
//  - 转写偏离不等于用户读错，疑似替换一律标"疑似"，交用户回听自录确认；
//  - 对单复数/时态等近形差异做宽松命中，降低把 ASR 误差算成用户错误的概率。
// 纯函数、无 DOM，可被前端与 Node 单测共用。

export interface HypWord { w: string; t: [number, number | null] }

export type AlignOp =
  | { kind: "hit"; ref: string; said: string; t0: number; t1: number | null; fuzzy: boolean }
  | { kind: "miss"; ref: string }            // 参考句有、转写里没有 → 漏词（也可能没识别到，需回听）
  | { kind: "sub"; ref: string; said: string; t0: number; t1: number | null } // 疑似替换
  | { kind: "extra"; said: string; t0: number; t1: number | null };           // 多读的词

export interface GapMark { afterRef: string; sec: number; at: number }

export interface AlignResult {
  ops: AlignOp[];
  refCount: number;          // 参考句词数
  saidCount: number;         // 转写词数
  hit: number;               // 精确+宽松命中的参考词数
  exactHit: number;
  /** 句级相似度=命中参考词/参考词数，0~1，仅作参考不作发音分 */
  similarity: number;
  misses: string[];
  subs: { ref: string; said: string }[];
  extras: string[];
  durationSec: number;       // 由转写词时间戳估算的实际开口时长
  spokenWpm: number;         // 实际语速（词/分）
  gaps: GapMark[];           // 节奏位置：相邻命中词之间停顿过长
}

// 归一化：小写、去标点、去撇号（don't→dont 与 whisper 输出对齐）
export function normToken(raw: string): string {
  return raw.toLowerCase().replace(/['’`]/g, "").replace(/[^a-z0-9]/g, "").trim();
}

export function tokenize(sentence: string): string[] {
  return (sentence || "")
    .split(/\s+/)
    .map(normToken)
    .filter(Boolean);
}

// 宽松命中：长度足够时编辑距离<=1，或一方是另一方前缀（吞掉复数/时态尾音的 ASR 误差）
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

function isClose(a: string, b: string): boolean {
  if (a === b) return true;
  // 只对"较长词"放宽，避免 cat/car、bit/bat 这类短词近形被误判为命中
  if (Math.max(a.length, b.length) < 4) return false;
  if (lev(a, b) <= 1) return true;
  const lo = a.length <= b.length ? a : b, hi = a.length <= b.length ? b : a;
  return hi.startsWith(lo) && hi.length - lo.length <= 2;
}

const GAP_SEC = 1.2; // 相邻词停顿超过该值标为节奏位置（犹豫/卡顿）

export function alignRead(refSentence: string, hyp: HypWord[]): AlignResult {
  const ref = tokenize(refSentence);
  const hy = (hyp || []).map((h) => ({ w: normToken(h.w), raw: h.w, t: h.t })).filter((h) => h.w);
  const R = ref.length, H = hy.length;

  // 词级最小编辑距离 DP；对角错配=替换(sub)，横向=漏词(miss)，纵向=多读(extra)
  // dp[i][j] = 把 ref[0..i) 对齐到 hy[0..j) 的最小代价
  const dp: number[][] = Array.from({ length: R + 1 }, () => new Array<number>(H + 1).fill(0));
  for (let i = 0; i <= R; i++) dp[i][0] = i;
  for (let j = 0; j <= H; j++) dp[0][j] = j;
  for (let i = 1; i <= R; i++) {
    for (let j = 1; j <= H; j++) {
      const repCost = isClose(ref[i - 1], hy[j - 1].w) ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + repCost, // 命中或替换
        dp[i - 1][j] + 1,           // 漏词
        dp[i][j - 1] + 1,           // 多读
      );
    }
  }

  // 回溯（平局优先对角，让错配成对出现为 sub）
  const ops: AlignOp[] = [];
  let i = R, j = H;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const repCost = isClose(ref[i - 1], hy[j - 1].w) ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + repCost) {
        const rw = ref[i - 1], h = hy[j - 1];
        if (repCost === 0) ops.push({ kind: "hit", ref: rw, said: h.raw, t0: h.t[0], t1: h.t[1], fuzzy: rw !== h.w });
        else ops.push({ kind: "sub", ref: rw, said: h.raw, t0: h.t[0], t1: h.t[1] });
        i--; j--; continue;
      }
    }
    if (i > 0 && (j === 0 || dp[i][j] === dp[i - 1][j] + 1)) {
      ops.push({ kind: "miss", ref: ref[i - 1] }); i--;
    } else if (j > 0) {
      const h = hy[j - 1];
      ops.push({ kind: "extra", said: h.raw, t0: h.t[0], t1: h.t[1] }); j--;
    }
  }
  ops.reverse();

  let hit = 0, exactHit = 0;
  const misses: string[] = [], subs: { ref: string; said: string }[] = [], extras: string[] = [];
  // 节奏：相邻"有发音"的命中/替换之间，起始间隔过长则标记
  const gaps: GapMark[] = [];
  let lastEnd: number | null = null; let lastRef = "";
  for (const op of ops) {
    if (op.kind === "hit") {
      hit++; if (!op.fuzzy) exactHit++;
      if (lastEnd !== null && op.t0 - lastEnd > GAP_SEC) gaps.push({ afterRef: lastRef, sec: +(op.t0 - lastEnd).toFixed(2), at: op.t0 });
      lastEnd = op.t1 ?? op.t0; lastRef = op.ref;
    } else if (op.kind === "sub") {
      subs.push({ ref: op.ref, said: op.said });
      if (lastEnd !== null && op.t0 - lastEnd > GAP_SEC) gaps.push({ afterRef: lastRef, sec: +(op.t0 - lastEnd).toFixed(2), at: op.t0 });
      lastEnd = op.t1 ?? op.t0; lastRef = op.ref;
    } else if (op.kind === "miss") {
      misses.push(op.ref);
    } else if (op.kind === "extra") {
      extras.push(op.said);
    }
  }

  let durationSec = 0;
  for (const h of hy) durationSec = Math.max(durationSec, h.t[1] ?? h.t[0]);
  const spokenWpm = durationSec > 0 ? Math.round((H / durationSec) * 60) : 0;

  return {
    ops, refCount: R, saidCount: H, hit, exactHit,
    similarity: R ? +(hit / R).toFixed(3) : 0,
    misses, subs, extras,
    durationSec: +durationSec.toFixed(2), spokenWpm, gaps,
  };
}
