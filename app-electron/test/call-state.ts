import {
  ensureResponse, withTextDelta, withAudioSamples, markDone,
  heardCharEnd, heardPrefix, buildContextTranscript, trimTranscriptToChars,
  frameLevel, freezeTurnsWithHeardPrefix,
} from "../src/call/call-state.ts";

let passed = 0, failed = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) { passed++; }
  else { failed++; console.log("FAIL:", msg); }
}
function eq(actual: unknown, expected: unknown, msg: string): void {
  ok(actual === expected, `${msg} got=${JSON.stringify(actual)} exp=${JSON.stringify(expected)}`);
}

// —— 响应累积 ——
{
  let m = {};
  m = ensureResponse(m, "r1");
  ok(!!m["r1"], "ensureResponse 应创建响应");
  const before = m["r1"];
  const m2 = ensureResponse(m, "r1");
  ok(m2["r1"] === before, "ensureResponse 已存在不应重建");

  m = withTextDelta(m, "r1", "Hello ");
  m = withTextDelta(m, "r1", "there");
  eq(m["r1"].text, "Hello there", "文本 delta 应累积");

  m = withAudioSamples(m, "r1", 2400);
  m = withAudioSamples(m, "r1", 1200);
  eq(m["r1"].audioSamples, 3600, "音频样本应累积");
  m = withAudioSamples(m, "r1", -99);
  eq(m["r1"].audioSamples, 3600, "负样本增量应被忽略");

  eq(m["r1"].done, false, "初始未完成");
  m = markDone(m, "r1");
  eq(m["r1"].done, true, "markDone 应置完成");
  const keys = Object.keys(markDone(m, "missing"));
  eq(keys.length, 1, "markDone 未知响应不应创建");
}

// —— 已听前缀 ——
const text = "the quick brown fox jumps over the lazy dog and then it runs away quickly";
{
  eq(heardCharEnd("", 50, 100), 0, "空文本终点为 0");
  eq(heardCharEnd(text, 50, 0), 0, "总样本为 0 终点为 0");
  eq(heardCharEnd(text, 0, 100), 0, "听到 0 比例终点为 0");
  const full = heardCharEnd(text, 100, 100);
  eq(full, text.length, "全听终点为文本长度");
  const over = heardCharEnd(text, 150, 100);
  eq(over, text.length, "比例超 1 应钳制");

  const half = heardCharEnd(text, 50, 100);
  ok(half >= 25 && half <= 35, `半听终点应在半长附近且吸附词边界 got=${half}`);
  const prefix = heardPrefix(text, 50, 100);
  eq(prefix, text.slice(0, half), "heardPrefix 应与终点一致");
  ok(!prefix.endsWith(" "), "前缀不应以空格结尾");
}

// —— transcript 组装与裁剪 ——
{
  const t = buildContextTranscript([
    { role: "user", text: "Hi there", status: "completed" },
    { role: "assistant", text: "", status: "completed" },
    { role: "assistant", text: "  ", status: "completed" },
    { role: "assistant", text: "Hello! How are you?", status: "completed" },
  ]);
  eq(t, "User: Hi there\nAssistant: Hello! How are you?", "transcript 应带角色标签并跳过空轮");

  eq(buildContextTranscript([]), "", "空 transcript 为空串");

  const long = "User: first line of text\nAssistant: second line here\nUser: third line ends".repeat(4);
  const trimmed = trimTranscriptToChars(long, 80);
  ok(trimmed.length <= 80, "裁剪后不应超长");
  ok(!trimmed.startsWith("\n"), "裁剪后不应以换行开头");
  eq(trimTranscriptToChars("short", 100), "short", "未超长应原样返回");
}

// —— 帧电平 ——
{
  const silence = new Int16Array(2048);
  eq(frameLevel(silence), 0, "静音帧电平为 0");
  const loud = new Int16Array(2048);
  loud.fill(32767);
  eq(frameLevel(loud), 1, "满幅帧电平钳为 1");
  const half = new Int16Array(2048);
  half.fill(10000);
  const lvl = frameLevel(half);
  ok(lvl > 0.3 && lvl < 1, `中等电平应在 (0.3,1) got=${lvl}`);
}

// —— 打断固化 ——
{
  const turns = [
    { role: "user", text: "hi", status: "completed" as const },
    { role: "assistant", text, status: "completed" as const },
  ];
  const out = freezeTurnsWithHeardPrefix(turns, 50, 100);
  eq(out.length, 2, "部分听到应保留轮数");
  eq(out[1].status, "interrupted", "末轮应标记 interrupted");
  const expPrefix = heardPrefix(text, 50, 100);
  eq(out[1].text, expPrefix, "末轮文本应为已听前缀");

  const gone = freezeTurnsWithHeardPrefix(turns, 0, 100);
  eq(gone.length, 1, "一个字没听到应移除末轮");

  const userLast = [
    { role: "user", text: "hi", status: "completed" as const },
  ];
  const unchanged = freezeTurnsWithHeardPrefix(userLast, 50, 100);
  ok(unchanged === userLast, "末轮非 assistant 应原样返回");

  eq(freezeTurnsWithHeardPrefix([], 50, 100).length, 0, "空轮列表应安全返回");
}

console.log(`\ncall-state: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
