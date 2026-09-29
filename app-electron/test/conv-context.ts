// V8-2c 上下文窗口纯逻辑单测（Node --experimental-strip-types）：
// token 估算、预算内全保留、超预算只保留最近轮次且顺序不乱、单条超长仍保留最新条。
import {
  estimateTokens,
  selectWindow,
  windowTokens,
  HISTORY_TOKEN_BUDGET,
  summaryUserMessage,
  type ChatMsg,
} from "../src/conversation/context-window.ts";

let pass = 0,
  fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log("PASS", name);
  } else {
    fail++;
    console.log("FAIL", name, extra ?? "");
  }
}

// 1) token 估算
check("英文空串为 0", estimateTokens("") === 0);
check("英文 8 字符约 2 token", estimateTokens("abcdefgh") === 2);
check("中文按字计", estimateTokens("你好世界") === 4);
check("中英混合", estimateTokens("你好 abcd") === 4);

// 2) 空输入
{
  const r = selectWindow([]);
  check("空历史窗口与溢出皆空", r.window.length === 0 && r.overflow.length === 0);
}

// 3) 预算内全部保留
{
  const turns: ChatMsg[] = [
    { role: "user", content: "Hello there" },
    { role: "assistant", content: "Hi, how are you?" },
    { role: "user", content: "I am fine thanks" },
  ];
  const r = selectWindow(turns);
  check("短历史全保留", r.window.length === 3 && r.overflow.length === 0);
  check("窗口顺序为时间顺序", r.window.map((m) => m.content).join("|") === turns.map((m) => m.content).join("|"));
}

// 4) 超预算：旧轮次进 overflow，窗口只留最近的且 token 不超预算（允许最新一条特例）
{
  const turns: ChatMsg[] = Array.from({ length: 24 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `This is message number ${i} with quite a lot of ordinary English words to fill the budget nicely today.`,
  }));
  const r = selectWindow(turns);
  check("有溢出轮次", r.overflow.length > 0);
  check("窗口+溢出=全部", r.window.length + r.overflow.length === turns.length);
  check("窗口是最近的轮次", r.window[r.window.length - 1].content === turns[turns.length - 1].content);
  check("溢出是最早的轮次", r.overflow[0].content === turns[0].content);
  check("窗口 token 在预算内", windowTokens(r.window) <= HISTORY_TOKEN_BUDGET + estimateTokens(turns[turns.length - 1].content) + 4);
}

// 5) 最新一条即使超长也保留
{
  const big = "x".repeat(4000);
  const r = selectWindow([{ role: "user", content: big }]);
  check("单条超长仍保留最新条", r.window.length === 1 && r.overflow.length === 0);
}

// 6) 自定义预算
{
  const turns: ChatMsg[] = [
    { role: "user", content: "one two three four" },
    { role: "assistant", content: "five six seven eight nine" },
  ];
  const r = selectWindow(turns, 10);
  check("小预算挤出旧消息", r.overflow.length === 1 && r.window.length === 1);
  check("小预算保留最新", r.window[0].content === turns[1].content);
}

// 7) 摘要请求包含旧摘要与溢出消息
{
  const msg = summaryUserMessage("old bullets", [{ role: "user", content: "hello" }]);
  check("摘要请求拼接完整", msg.includes("old bullets") && msg.includes("hello") && msg.includes("Older messages"));
  const msg2 = summaryUserMessage("", [{ role: "assistant", content: "hi" }]);
  check("无旧摘要显示占位", msg2.includes("(none)"));
}

console.log(`\nconv-context: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
