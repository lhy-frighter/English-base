// 交接文档顶部插入「中文澄清 + 上下文跑题检测」条目（CRLF，倒序）
const fs = require("node:fs");
const p = "../交接文档.md";
let s = fs.readFileSync(p, "utf8");
const marker = "# 个人英语能力底座 · 交接文档\r\n";
if (!s.includes(marker)) throw new Error("title marker not found");
if (s.includes("中文澄清 + 上下文跑题检测")) { console.log("already inserted"); process.exit(0); }
const entry = [
  "> 更新：2026-09-25 · **#151 补丁 v2：中文澄清 + 上下文跑题检测**（真机复验：澄清触发了但用英文问，学习者看不懂；且未联系上文）",
  "> - 提示词改写：①澄清问题**必须用中文**（如「我没太听懂，你是想说……吗？」），这是唯一允许助手写中文的场景；②每条用户消息都要对照话题与近期轮次——若内容跑题、断裂、像被发音错误强制拼成句子，**不得跟着新方向走**，要引用上文用中文澄清；③有把握纠正则走 TEACH，中文澄清与 TEACH 同轮不可共存。",
  "> - tts-chunks.ts 新增 ttsSafeText：按句过滤含 CJK 字符的片段，中文澄清只显示、不被英文 TTS 念出（tts-chunks 测试 +4，共 80）。",
  "> - 助手气泡检测中文自动加 conv-clarify-bubble 样式（brass-wash 底、虚线边，区别于普通回复）。",
  "> - teach-prompt 冻结测试更新为 13 checks（中文澄清、跑题检测、澄清/TEACH 互斥等）。",
  "> - **验证**：全量 **51 链零失败**；tsc=0；vite build=0。",
  "> - **待真机复验（用户本人）**：说与话题无关/乱句 → 助手应显示中文澄清（不出声）并引用上文猜测；普通语法错误仍走 TEACH 英文纠错。",
  ">",
  "",
].join("\r\n");
s = s.replace(marker, marker + entry);
fs.writeFileSync(p, s);
console.log("inserted");
