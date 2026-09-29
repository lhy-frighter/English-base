// 冻结评测集：teach-parse（V9 §4.2）
import { parseTeach, splitTeach, visibleOfStream, teachMatchesVisible, type TeachPayload } from "../src/conversation/teach-parse.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.log("FAIL", name); }
}

function makeBlock(obj: string): string {
  return `Sure! You can say: "I'd like to take a day off."\n[TEACH: ${obj}]`;
}
const validJson = JSON.stringify({
  en: "I'd like to take a day off.",
  zh: "我想请一天假。",
  chunks: [{ en: "take a day off", zh: "请一天假" }],
  words: [{ en: "off", zh: "休假" }],
  grammar: [{ structure: "I'd like to + 动词", note: "礼貌表达想做某事" }],
});

// 1) 合法尾块
const okSplit = splitTeach(makeBlock(validJson));
check("合法块：解析成功", okSplit.teach !== null);
check("合法块：可见正文不含 TEACH", !okSplit.visible.includes("[TEACH"));
check("合法块：chunks 数量", okSplit.teach?.chunks.length === 1);
check("合法块：grammar 数量", okSplit.teach?.grammar.length === 1);

// 2) 截断（无闭合括号）
const trunc = splitTeach(`You can say this.\n[TEACH: {"en":"I'd like`);
check("截断块：teach=null", trunc.teach === null);
check("截断块：dangling=true", trunc.dangling === true);
check("截断块：正文保留", trunc.visible.includes("You can say this."));

// 3) 坏 JSON
const bad = splitTeach(makeBlock(`{"en":"x", zh broken`));
check("坏 JSON：teach=null", bad.teach === null);
check("坏 JSON：降级普通对话（正文保留）", bad.visible.includes("Sure!"));

// 4) 缺字段
const miss = splitTeach(makeBlock(JSON.stringify({ en: "only en" })));
check("缺 zh：teach=null", miss.teach === null);

// 5) 重复块
const dup = splitTeach(
  `Text.\n[TEACH: ${validJson}]\nmore\n[TEACH: ${validJson}]`
);
check("重复块：teach=null", dup.teach === null);

// 6) 尾块不在末尾
const notTail = splitTeach(`Text.\n[TEACH: ${validJson}]\nHope that helps!`);
check("非尾部块：teach=null", notTail.teach === null);

// 7) 纯文本
const plain = splitTeach("Just a normal reply with no tail block.");
check("纯文本：teach=null", plain.teach === null);
check("纯文本：正文完整", plain.visible === "Just a normal reply with no tail block.");

// 8) 流式可见
check("流式：无标记原样返回", visibleOfStream("Hello there") === "Hello there");
check("流式：未闭合标记被剥离", visibleOfStream('Hello\n[TEACH: {"en":') === "Hello");
check("流式：完整块被剥离", !visibleOfStream(makeBlock(validJson)).includes("[TEACH"));

// 9) en 与正文对应
const payload = parseTeach(validJson);
check("en 对应正文（包含）", teachMatchesVisible(payload, `Sure! You can say: "I'd like to take a day off."`));
const mismatched: TeachPayload = { ...payload, en: "something completely different here now" };
check("en 对不上：拒绝", !teachMatchesVisible(mismatched, "Sure! You can say this other thing."));

// 10) parseTeach 直接校验
check("parseTeach 字段完整", payload.en && payload.zh && payload.words.length === 1);
let threw = false;
try { parseTeach("{not json"); } catch { threw = true; }
check("parseTeach 坏 JSON 抛错", threw);

console.log(`teach-parse: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
