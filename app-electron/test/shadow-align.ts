// 跟读对齐算法单测（Node --experimental-strip-types 直接跑 TS）
import { alignRead, tokenize, normToken } from "../src/shadow/align.ts";
import { wordSpan, slicePcm } from "../src/shadow/clip.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name, extra ?? ""); }
}
const hw = (words: string[], step = 0.4) => words.map((w, i) => ({ w, t: [+(i * step).toFixed(2), +((i + 1) * step).toFixed(2)] as [number, number | null] }));
const kinds = (r: ReturnType<typeof alignRead>) => r.ops.map((o) => o.kind);

// 1. 归一化与分词
check("去撇号大小写标点", normToken("Don't!") === "dont");
check("tokenize 过滤空", JSON.stringify(tokenize("I, am — here.")) === JSON.stringify(["i", "am", "here"]));

// 2. 全对
{
  const r = alignRead("I am here now", hw(["I", "am", "here", "now"]));
  check("全对：4 hit 0 漏 0 替换", r.hit === 4 && r.misses.length === 0 && r.subs.length === 0, JSON.stringify(r.ops));
  check("全对：相似度=1", r.similarity === 1, r.similarity);
  check("全对：wpm=60（1.6s 4词）", r.spokenWpm === 150, r.spokenWpm);
}

// 3. 漏一个词
{
  const r = alignRead("I am here now", hw(["I", "here", "now"]));
  check("漏词：识别出 miss=am", JSON.stringify(r.misses) === JSON.stringify(["am"]), JSON.stringify(r.ops));
  check("漏词：命中=3 相似度0.75", r.hit === 3 && r.similarity === 0.75, r.similarity);
}

// 4. 疑似替换（对角成对，不拆成 miss+extra）
{
  const r = alignRead("I am here now", hw(["I", "was", "here", "now"]));
  check("替换：1 sub am→was", r.subs.length === 1 && r.subs[0].ref === "am" && r.subs[0].said === "was", kinds(r));
  check("替换：无独立 miss/extra", r.misses.length === 0 && r.extras.length === 0, kinds(r));
}

// 5. 多读（extra）
{
  const r = alignRead("I am here", hw(["I", "am", "like", "here"]));
  check("多读：extra=like", JSON.stringify(r.extras) === JSON.stringify(["like"]), kinds(r));
  check("多读：参考词仍全命中", r.hit === 3, r.hit);
}

// 6. 宽松命中：复数/时态近形算 hit 但 fuzzy
{
  const r = alignRead("three cats sitting", hw(["three", "cat", "sitting"]));
  const catOp = r.ops.find((o) => o.kind === "hit" && o.ref === "cats");
  check("近形 cats/cat 宽松命中且 fuzzy", !!catOp && catOp.kind === "hit" && catOp.fuzzy === true, JSON.stringify(r.ops));
  check("近形：exactHit 不含 fuzzy", r.exactHit === 2 && r.hit === 3, `${r.exactHit}/${r.hit}`);
}

// 7. 节奏：停顿 >1.2s 标 gap
{
  const words = [{ w: "I", t: [0, 0.3] as [number, number | null] }, { w: "am", t: [0.3, 0.6] as [number, number | null] },
    { w: "here", t: [2.0, 2.3] as [number, number | null] }]; // am→here 间隔 1.4s
  const r = alignRead("I am here", words);
  check("节奏：在 am 后标到 1 处卡顿", r.gaps.length === 1 && r.gaps[0].afterRef === "am", JSON.stringify(r.gaps));
}

// 8. 缩写归一：参考 don't 与转写 dont 视为命中
{
  const r = alignRead("I don't know", hw(["I", "dont", "know"]));
  check("缩写归一全命中", r.hit === 3 && r.similarity === 1, kinds(r));
}

// 9. 空转写：全部漏词，不崩
{
  const r = alignRead("one two three", []);
  check("空转写：3 miss 相似度0", r.misses.length === 3 && r.similarity === 0 && r.spokenWpm === 0, JSON.stringify(r));
  const r2 = alignRead("", []);
  check("空参考句不崩", r2.refCount === 0 && r2.ops.length === 0);
}

// 10. 长句错位仍能对齐主体（漏读开头）
{
  const r = alignRead("the quick brown fox jumps", hw(["brown", "fox", "jumps"]));
  check("漏读开头两词", JSON.stringify(r.misses) === JSON.stringify(["the", "quick"]) && r.hit === 3, kinds(r));
}

// 11. 单词回听切片区间（wordSpan）
{
  const s = wordSpan(1.0, 1.5, null, 3.0);
  check("正常戳：前留 0.09 后留 0.14", Math.abs(s.start - 0.91) < 1e-9 && Math.abs(s.end - 1.64) < 1e-9, JSON.stringify(s));
  const s2 = wordSpan(1.0, null, 2.0, 3.0);
  check("t1 缺失：用下一词起点-0.05 与兜底词长取小，再加尾留", Math.abs(s2.end - 1.84) < 1e-9, JSON.stringify(s2));
  const s3 = wordSpan(1.0, null, null, 3.0);
  check("t1 与下一词都缺：兜底 0.7s", Math.abs(s3.end - 1.84) < 1e-9, JSON.stringify(s3));
  const s4 = wordSpan(2.9, 3.4, null, 3.0);
  check("尾部 clamp 到录音时长", s4.end === 3.0 && s4.start <= 3.0, JSON.stringify(s4));
  const s5 = wordSpan(0.05, 0.4, null, 3.0);
  check("头部 clamp 到 0", s5.start === 0, JSON.stringify(s5));
  const s6 = wordSpan(1.0, 9.0, null, 12.0); // 异常长戳
  check("单切片上限 2.4s 收口", Math.abs(s6.end - 3.54) < 1e-9, JSON.stringify(s6));
  const s7 = wordSpan(-1, null, null, 3);
  check("非法 t0 返回零长区间", s7.start === 0 && s7.end === 0, JSON.stringify(s7));
}

// 12. PCM 切片（slicePcm）
{
  const pcm = new Float32Array(16000 * 2).fill(0.25);
  const seg = slicePcm(pcm, 16000, { start: 0, end: 0.125 });
  check("0.125s 切出 2000 采样", seg.length === 2000, seg.length);
  check("切片是拷贝且内容一致", seg[0] === 0.25 && seg[1999] === 0.25);
  const tail = slicePcm(pcm, 16000, { start: 1.9, end: 5 });
  check("超出长度的区间 clamp 到尾部", tail.length === 1600, tail.length);
  const empty = slicePcm(pcm, 16000, { start: 1, end: 1 });
  check("零长区间返回空切片", empty.length === 0);
}

console.log(`\n${pass} 通过 / ${fail} 失败 / shadow-align`);
process.exit(fail ? 1 : 0);
