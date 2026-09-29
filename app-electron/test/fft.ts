// FFT 正确性：混合基 FFT 对比朴素 DFT；rfft 幅度对比
import { mixedRadixFft, rfftMagSquared } from "../src/conversation/fft.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass++; else { fail++; console.log("FAIL", name); }
}

function naiveDft(re: number[], im: number[], inverse: boolean) {
  const n = re.length, sign = inverse ? 1 : -1;
  const or = new Float64Array(n), oi = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let sr = 0, si = 0;
    for (let q = 0; q < n; q++) {
      const ang = (sign * 2 * Math.PI * j * q) / n;
      sr += re[q] * Math.cos(ang) - im[q] * Math.sin(ang);
      si += re[q] * Math.sin(ang) + im[q] * Math.cos(ang);
    }
    or[j] = sr; oi[j] = si;
  }
  if (inverse) { for (let i = 0; i < n; i++) { or[i] /= n; oi[i] /= n; } }
  return [or, oi];
}

for (const n of [400, 10, 25, 50, 200]) {
  const re = [], im = [];
  let seed = n * 7 + 1;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < n; i++) { re.push(rnd() * 2 - 1); im.push(rnd() * 2 - 1); }
  const [er, ei] = naiveDft(re, im, false);
  const gr = new Float64Array(re), gi = new Float64Array(im);
  mixedRadixFft(gr, gi);
  let maxErr = 0;
  for (let i = 0; i < n; i++) maxErr = Math.max(maxErr, Math.abs(er[i] - gr[i]), Math.abs(ei[i] - gi[i]));
  check(`fft forward n=${n} err<1e-8 (got ${maxErr.toExponential(2)})`, maxErr < 1e-8);

  // 逆变换还原
  mixedRadixFft(gr, gi, { inverse: true });
  let backErr = 0;
  for (let i = 0; i < n; i++) backErr = Math.max(backErr, Math.abs(re[i] - gr[i]), Math.abs(im[i] - gi[i]));
  check(`fft inverse n=${n} err<1e-8 (got ${backErr.toExponential(2)})`, backErr < 1e-8);
}

// 实序列 rfft 与朴素 DFT 幅度
{
  const n = 400;
  const re = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin(2 * Math.PI * 3 * i / n) + 0.5 * Math.cos(2 * Math.PI * 7 * i / n);
  const [er, ei] = naiveDft([...re].map(Number), new Array(n).fill(0), false);
  const mag = rfftMagSquared(re);
  let maxErr = 0;
  for (let k = 0; k <= n / 2; k++) maxErr = Math.max(maxErr, Math.abs(mag[k] - (er[k] ** 2 + ei[k] ** 2)));
  check(`rfft mag err<1e-8 (got ${maxErr.toExponential(2)})`, maxErr < 1e-8);
}

console.log(`fft tests: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
