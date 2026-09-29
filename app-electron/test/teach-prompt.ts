// 冻结测试：对话系统提示词必须包含纠错/澄清/TEACH 关键指令，防止后续改 prompt 时静默丢失
import { systemPrompt } from "../src/conversation/conversation-prompt.ts";

let passed = 0, failed = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) { passed++; }
  else { failed++; console.log("FAIL:", msg); }
}

const topic = { goal: "Daily small talk", cefr: "B1", suggestedTurns: 8 } as const;
const p = systemPrompt(topic as any);
const summary = systemPrompt(topic as any, true);

ok(p.includes("append exactly one TEACH block"), "语法/求说法错误必须 TEACH");
ok(p.includes("NEVER pretend it was clear"), "乱句不得假装理解");
ok(p.includes("clarification question in Chinese"), "乱句必须用中文澄清");
ok(p.includes("only situation where you may write Chinese"), "只有澄清允许中文");
ok(p.includes("asking for clarification always beats guessing"), "澄清优先于猜测");
ok(p.includes("Never output both a Chinese clarification and a TEACH block"), "澄清与 TEACH 不可共存");
ok(p.includes("recent turns"), "必须联系上下文判断");
ok(p.includes("TEACH block format"), "必须保留 TEACH 格式说明");
ok(p.includes("never output more than one TEACH block"), "只允许一个 TEACH");
ok(systemPrompt(topic as any, false, "teach").includes("MODE: TEACH"), "teach 模式指令");
ok(systemPrompt(topic as any, false, "chat").includes("MODE: CHAT"), "chat 模式指令");
ok(!summary.includes("TEACH block format"), "复盘提示词不应含 TEACH 格式");
ok(summary.includes("end-of-session report"), "复盘提示词应要求结束报告");

console.log(`teach-prompt: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
