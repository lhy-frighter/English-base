// TTS 意群切分/停顿规划纯函数单测（node --experimental-strip-types 直接跑 TS）
import { splitClauses, splitSentences, planKokoroChunks, maskProtected, unmask, pauseAfter, drainSentences, planStreamQueue, ttsSafeText } from "../src/tts-chunks.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name, extra ?? ""); }
}
const texts = (cs: ReturnType<typeof splitClauses>) => cs.map((c) => c.text);
const pauses = (cs: ReturnType<typeof splitClauses>) => cs.map((c) => c.pause);

// 1. 基本切分与停顿
{
  const cs = splitClauses("benefit");
  check("单词单段", cs.length === 1 && cs[0].pause === 0, JSON.stringify(cs));
}
{
  const cs = splitClauses("However, this is hard.");
  check("逗号切两段", cs.length === 2, JSON.stringify(texts(cs)));
  check("逗号停顿100", cs[0].pause === 100, pauses(cs));
  check("末段不停顿", cs[1].pause === 0, pauses(cs));
}
{
  const cs = splitClauses("I went home. She stayed.");
  check("两句切两段", cs.length === 2, JSON.stringify(texts(cs)));
  check("句末停顿260", cs[0].pause === 260, pauses(cs));
}
{
  const cs = splitClauses("Wait — really?");
  check("破折号停顿150", cs[0].pause === 150, pauses(cs));
}

// 2. 换行停顿（必须在 trim 之前判定 raw）
{
  const cs = splitClauses("Line one\nLine two");
  check("换行切两段", cs.length === 2, JSON.stringify(texts(cs)));
  check("换行停顿340可命中", pauseAfter("Line one\n") === 340, pauses(cs));
  check("换行首段停顿340", cs[0].pause === 340, pauses(cs));
  check("换行片段文本不含换行符", cs[0].text === "Line one", JSON.stringify(texts(cs)));
}

// 3. 缩写/数字不得被误切
{
  const cs = splitClauses("Dr. Smith arrived.");
  check("Dr. 不被误切", cs.length === 1, JSON.stringify(texts(cs)));
  check("Dr. 句点还原", cs[0].text === "Dr. Smith arrived.", cs[0].text);
}
{
  const cs = splitClauses("Pi is 3.14 roughly.");
  check("小数 3.14 不被误切", cs.length === 1, JSON.stringify(texts(cs)));
  check("小数点还原", cs[0].text.includes("3.14"), cs[0].text);
}
{
  const cs = splitClauses("The U.S. economy grew.");
  check("U.S. 不被误切", cs.length === 1, JSON.stringify(texts(cs)));
  check("U.S. 点还原", cs[0].text.includes("U.S."), cs[0].text);
}
{
  const cs = splitClauses("It costs 1,000 dollars, today.");
  check("千分位不误切、逗号仍切", cs.length === 2, JSON.stringify(texts(cs)));
  check("千分位逗号还原", texts(cs)[0].includes("1,000"), JSON.stringify(texts(cs)));
}
{
  const cs = splitClauses("Use fruits, e.g. apples, often.");
  // e.g. 的点受保护；真正的切分只在逗号处：3 段
  check("e.g. 不被误切", cs.length === 3 && cs[1].text.startsWith("e.g."), JSON.stringify(texts(cs)));
}
{
  const cs = splitClauses("It is fast, i.e. quick, indeed.");
  check("i.e. 不被误切", cs.length === 3 && cs[1].text.startsWith("i.e."), JSON.stringify(texts(cs)));
}
{
  const cs = splitClauses("See Fig. 3 and Vol. 2 later.");
  check("Fig./Vol. 不被误切", cs.length === 1, JSON.stringify(texts(cs)));
}

// 4. 文本无损：拼回后去空白应与原文去空白一致
{
  const samples = [
    "Dr. Smith paid 1,000 dollars for 3.14 kg in the U.S. yesterday.",
    "However, this is hard.\nWe must try again; soon, and carefully — really?",
  ];
  for (const s of samples) {
    const cs = splitClauses(s);
    const joined = cs.map((c) => c.text).join(" ").replace(/\s+/g, "");
    check("文本无损: " + s.slice(0, 24), joined === s.replace(/\s+/g, ""), joined);
  }
}

// 5. 占位/还原
check("占位还原往返", unmask(maskProtected("Dr. 3.14 1,000 U.S.")) === "Dr. 3.14 1,000 U.S.");

// 6. 超长无标点单段：再切且中间块不停顿、每块 ≤240
{
  const long = "word ".repeat(100).trim(); // 499 字符、无标点
  const cs = splitClauses(long);
  check("长单段被再切", cs.length >= 3, cs.length);
  check("每块不超过240字符", cs.every((c) => c.text.length <= 240), Math.max(...cs.map((c) => c.text.length)));
  check("长单段中间块停顿为0", cs.slice(0, -1).every((c) => c.pause === 0), pauses(cs));
  check("长单段末块停顿为0", cs[cs.length - 1].pause === 0);
  const joined = cs.map((c) => c.text).join(" ").replace(/\s+/g, "");
  check("长单段文本无损", joined === long.replace(/\s+/g, ""));
}

// 7. 空输入与纯空白
check("空字符串零段", splitClauses("").length === 0);
check("纯空白零段", splitClauses("   \n  ").length === 0);

// 8. splitSentences：SAPI 句子级切分（逗号不切，保留句调）
{
  const cs = splitSentences("benefit");
  check("句级:单词单段", cs.length === 1 && cs[0].pause === 0, JSON.stringify(cs));
}
{
  const cs = splitSentences("However, this is hard.");
  check("句级:逗号不切", cs.length === 1, JSON.stringify(cs.map((c) => c.text)));
  check("句级:逗号文本完整", cs[0].text === "However, this is hard.", cs[0].text);
}
{
  const cs = splitSentences("I went home. She stayed.");
  check("句级:两句切两段", cs.length === 2, JSON.stringify(cs.map((c) => c.text)));
  check("句级:句末停顿240", cs[0].pause === 240, cs.map((c) => c.pause));
  check("句级:末段不停顿", cs[1].pause === 0);
}
{
  const cs = splitSentences("Line one\nLine two");
  check("句级:换行切两段", cs.length === 2, JSON.stringify(cs.map((c) => c.text)));
  check("句级:换行停顿340", cs[0].pause === 340, cs.map((c) => c.pause));
}
{
  const cs = splitSentences("Dr. Smith paid 1,000 dollars in the U.S. for 3.14 kg.");
  check("句级:缩写数字不误切", cs.length === 1, JSON.stringify(cs.map((c) => c.text)));
  check("句级:占位全部还原", cs[0].text.includes("Dr.") && cs[0].text.includes("1,000") && cs[0].text.includes("U.S.") && cs[0].text.includes("3.14"), cs[0].text);
}
{
  // 含多个逗号的超长句：应在逗号处再切，且每块 ≤240、中间块停顿 0、文本无损
  const long = Array.from({ length: 40 }, (_, i) => `clause number ${i} with some extra words`).join(", ") + ".";
  const cs = splitSentences(long);
  check("句级:超长句被再切", cs.length >= 2, cs.length);
  check("句级:每块不超过240字符", cs.every((c) => c.text.length <= 240), Math.max(...cs.map((c) => c.text.length)));
  check("句级:超长句中间块停顿为0", cs.slice(0, -1).every((c) => c.pause === 0), cs.map((c) => c.pause));
  const joined = cs.map((c) => c.text).join(" ").replace(/\s+/g, "");
  check("句级:超长句文本无损", joined === long.replace(/\s+/g, ""), joined.slice(0, 60));
}
check("句级:空字符串零段", splitSentences("").length === 0);
check("句级:纯空白零段", splitSentences("  \n ").length === 0);

// 9. planKokoroChunks：意群块 + 首块 ≤6 词
{
  const cs = planKokoroChunks("benefit");
  check("播放:单词单块", cs.length === 1 && cs[0].pause === 0, JSON.stringify(cs));
}
{
  // 短句（≤6 词）整块一次性合成，句内逗号的停顿/语调完全交给模型
  const cs = planKokoroChunks("However, this is hard.");
  check("播放:短句整块合成", cs.length === 1 && cs[0].text === "However, this is hard." && cs[0].seamless === undefined, JSON.stringify(cs));
}
{
  // 无逗号长首句：首块强制 ≤6 词，head 无停顿且 seamless（裁尾静音防断层）
  const long = "The unprecedented transformation of contemporary scientific communication continues rapidly every day.";
  const cs = planKokoroChunks(long);
  check("播放:首块不超过6词", cs[0].text.split(/\s+/).length <= 6, cs[0].text);
  check("播放:首块head停顿为0", cs[0].pause === 0, String(cs[0].pause));
  check("播放:首块seamless裁尾", cs[0].seamless === true);
  const joined = cs.map((c) => c.text).join(" ").replace(/\s+/g, "");
  check("播放:硬切文本无损", joined === long.replace(/\s+/g, ""), joined.slice(0, 60));
  check("播放:末块停顿为0", cs[cs.length - 1].pause === 0, String(cs[cs.length - 1].pause));
  check("播放:句末余块保留自然尾音", cs[cs.length - 1].seamless !== true);
}
{
  // 多句也整块合成：模型按全句语境自然处理句间断句与语调；句间补短间隙由播放层负责
  const cs = planKokoroChunks("I went home. She stayed.");
  check("播放:多句整块自然断句", cs.length === 1 && cs[0].text === "I went home. She stayed.", JSON.stringify(cs.map((c) => c.text)));
}
{
  const cs = planKokoroChunks("Dr. Smith paid 1,000 dollars.");
  check("播放:缩写数字不被误切", cs.length === 1 && cs[0].text === "Dr. Smith paid 1,000 dollars.", JSON.stringify(cs.map((c) => c.text)));
}
{
  // 长首句硬切后，缩写/数字/占位仍完整还原，整体文本无损
  const long = "Dr. Smith paid 1,000 dollars in the U.S. yesterday after 3.14 miles.";
  const cs = planKokoroChunks(long);
  const joined = cs.map((c) => c.text).join(" ").replace(/\s+/g, "");
  check("播放:硬切后缩写数字无损", joined === long.replace(/\s+/g, ""), joined);
}
// drainSentences 流式抽句
{
  const r = drainSentences("Hello there.");
  check("抽句:完整句就绪", r.ready.length === 1 && r.ready[0] === "Hello there." && r.rest === "", JSON.stringify(r));
}
{
  const r = drainSentences("Hello there. How are");
  check("抽句:末段残余", r.ready.length === 1 && r.ready[0] === "Hello there." && r.rest === "How are", JSON.stringify(r));
}
{
  const r = drainSentences("First. Second. Third");
  check("抽句:多句一次抽出", r.ready.length === 2 && r.ready[1] === "Second." && r.rest === "Third", JSON.stringify(r));
}
{
  const r = drainSentences("Dr. Smith arrived. He left.");
  check("抽句:缩写不误断", r.ready.length === 2 && r.ready[0] === "Dr. Smith arrived.", JSON.stringify(r));
}
{
  const r = drainSentences("Line one\nLine two");
  check("抽句:换行断句", r.ready.length === 1 && r.ready[0] === "Line one" && r.rest === "Line two", JSON.stringify(r));
}
{
  const r = drainSentences("not done yet");
  check("抽句:无边界全残余", r.ready.length === 0 && r.rest === "not done yet", JSON.stringify(r));
}
check("播放:空输入零块", planKokoroChunks("").length === 0);

// 10. planStreamQueue：模拟流式逐段 feed，每句只入队一次（重复 "hi there" 回归）
{
  const full = "Hi there! How are you today? I am good. Are you happy with your classes so far?";
  // 按 7 字符切片模拟增量，逐次调用并累计队列
  let cursor = 0;
  const queued: string[] = [];
  for (let i = 0; i < full.length; i += 7) {
    const cumulative = full.slice(0, i + 7);
    const r = planStreamQueue(cumulative, cursor, false);
    cursor = r.newDrainedChars;
    for (const q of r.queue) queued.push(q.sentence);
  }
  check("游标:四句各入队一次", queued.length === 4, JSON.stringify(queued));
  check("游标:首句不重复", queued[0] === "Hi there!" && queued.filter((s) => s === "Hi there!").length === 1, JSON.stringify(queued));
  check("游标:各句顺序正确", queued[1] === "How are you today?" && queued[2] === "I am good." && queued[3] === "Are you happy with your classes so far?", JSON.stringify(queued));
  // 全文已完整时 end()：无新增、游标在末尾
  const fin = planStreamQueue(full, cursor, true);
  check("游标:已完整时 final 无新增", fin.queue.length === 0 && fin.newDrainedChars === full.length, JSON.stringify(fin));
  const all = [...queued, ...fin.queue.map((q) => q.sentence)];
  check("游标:四句各一次无重复", all.length === 4 && new Set(all).size === 4, JSON.stringify(all));
}
{
  // final 冲刷残余：最后一句无结尾标点，end() 时才入队
  const base = "One sentence. Two without end";
  const r1 = planStreamQueue(base, 0, false);
  check("游标:中途只排完整句", r1.queue.length === 1 && r1.queue[0].sentence === "One sentence.", JSON.stringify(r1));
  const r2 = planStreamQueue(base, r1.newDrainedChars, true);
  check("游标:final 残余入队", r2.queue.length === 1 && r2.queue[0].sentence === "Two without end" && r2.newDrainedChars === base.length, JSON.stringify(r2));
}
{
  // 空输入与无边界残余：不产生队列、游标不动
  const r = planStreamQueue("not done", 0, false);
  check("游标:无完整句零队列", r.queue.length === 0 && r.newDrainedChars === 0, JSON.stringify(r));
  const r2 = planStreamQueue("", 0, false);
  check("游标:空输入零队列", r2.queue.length === 0 && r2.newDrainedChars === 0);
}
{
  // endOffset 为全文坐标：两句的 endOffset 指向各自边界
  const r = planStreamQueue("First. Second.", 0, false);
  check("游标:两句 endOffset", r.queue.length === 2 && r.queue[0].endOffset === 7 && r.queue[1].endOffset === 14, JSON.stringify(r.queue));
}

{
  // ttsSafeText 过滤：中文澄清整句不送 TTS
  check("ttsSafeText:纯英文保留", ttsSafeText("Hello there. How are you?") === "Hello there. How are you?");
  check("ttsSafeText:纯中文清空", ttsSafeText("我没太听懂，你是想说什么吗？") === "");
  const mixed = "Nice to hear that. 我没太听懂，你是想说……吗？ Let's continue.";
  const r = ttsSafeText(mixed);
  check("ttsSafeText:中英混合只留英文", r === "Nice to hear that. Let's continue.", r);
  check("ttsSafeText:空输入", ttsSafeText("") === "");
}

console.log(`\ntts-chunks: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
