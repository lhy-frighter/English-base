// 混合基 Cooley–Tukey FFT（支持 radix 2 / 5），用于 Whisper 400 点 rfft（400 = 2^4 × 5^2）。
// DIT：先数字逆序置换，再逐阶段蝶形；正/逆变换。

function factorize(n: number): number[] {
  const fs: number[] = [];
  let x = n;
  for (const r of [2, 5, 3]) {
    while (x % r === 0) { fs.push(r); x /= r; }
  }
  if (x !== 1) throw new Error("unsupported fft size: " + n);
  return fs;
}

function digitReverse(i: number, factors: number[]): number {
  const k = factors.length;
  const digits: number[] = [];
  let x = i;
  for (const f of factors) { digits.push(x % f); x = Math.floor(x / f); }
  // a = d_{k-1} + f_{k-1} d_{k-2} + f_{k-1} f_{k-2} d_{k-3} ...
  let a = 0, place = 1;
  for (let t = k - 1; t >= 0; t--) { a += place * digits[t]; place *= factors[t]; }
  return a;
}

export function mixedRadixFft(
  re: Float64Array,
  im: Float64Array,
  opts: { inverse?: boolean; factors?: number[] } = {},
): void {
  const n = re.length;
  if (im.length !== n) throw new Error("fft length mismatch");
  const factors = opts.factors ?? factorize(n);
  const sign = opts.inverse ? 1 : -1;

  // 数字逆序置换（混合基置换非对合，不能用 swap-if-greater，必须显式重排）
  const srcRe = new Float64Array(re), srcIm = new Float64Array(im);
  for (let i = 0; i < n; i++) {
    const a = digitReverse(i, factors);
    re[a] = srcRe[i]; im[a] = srcIm[i];
  }

  // 阶段按因子逆序执行（DIT：内层 n/f0 点 DFT 先做）；纯 radix-2 时逆序无差别
  let m = 1;
  for (let s = factors.length - 1; s >= 0; s--) {
    const r = factors[s];
    const span = r * m;
    for (let base = 0; base < n; base += span) {
      for (let k = 0; k < m; k++) {
        const xr = new Float64Array(r);
        const xi = new Float64Array(r);
        for (let j = 0; j < r; j++) {
          const idx = base + j * m + k;
          let vr = re[idx], vi = im[idx];
          // 输入旋转因子 W_span^{j·k}（DFT 移位定理：必须在 DFT 前作用于输入）
          const ang2 = (sign * 2 * Math.PI * j * k) / span;
          const c2 = Math.cos(ang2), s2 = Math.sin(ang2);
          xr[j] = vr * c2 - vi * s2;
          xi[j] = vr * s2 + vi * c2;
        }
        // r 点 DFT
        for (let j = 0; j < r; j++) {
          let sr = 0, si = 0;
          for (let q = 0; q < r; q++) {
            const ang = (sign * 2 * Math.PI * j * q) / r;
            const c = Math.cos(ang), s = Math.sin(ang);
            sr += xr[q] * c - xi[q] * s;
            si += xr[q] * s + xi[q] * c;
          }
          const idx = base + j * m + k;
          re[idx] = sr; im[idx] = si;
        }
      }
    }
    m = span;
  }
  if (opts.inverse) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

// 实序列 rfft，返回前 n/2+1 个 bin 的幅度平方
export function rfftMagSquared(real: Float64Array): Float64Array {
  const n = real.length;
  const re = new Float64Array(real);
  const im = new Float64Array(n);
  mixedRadixFft(re, im);
  const out = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k];
  return out;
}
