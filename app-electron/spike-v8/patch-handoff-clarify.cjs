// 交接文档顶部插入「纠错/澄清提示词加固」条目（CRLF，倒序）
const fs = require("node:fs");
const p = "../交接文档.md";
let s = fs.readFileSync(p, "utf8");
const marker = "# 个人英语能力底座 · 交接文档\r\n";
if (!s.includes(marker)) throw new Error("title marker not found");
if (s.includes("纠错/澄清提示词加固")) { console.log("already inserted"); process.exit(0); }
const entry = [
  "> 更新：2026-09-25 · **#151 补丁：纠错/澄清提示词加固**（真机发现明显语法/乱句未纠正，模型顺着说）",
  "> - 系统提示词新增两条硬指令：①句子不语法、不自然或语义不通（口语输入可能含识别错误）时，**NEVER 假装理解或顺着乱句往下说**——要么询问「I didn't quite catch that — did you mean X?」，要么给自然说法并附 TEACH；②语义不清时澄清优先于猜测。",
  "> - systemPrompt 抽为独立文件 src/conversation/conversation-prompt.ts（可测试）；新增冻结测试 test/teach-prompt.ts（10 checks：TEACH 指令、乱句澄清、teach/chat 模式、复盘提示词不含 TEACH）。",
  "> - runGeneration 加诊断：原始输出含「[TEACH」但 splitTeach 校验未通过时 console.warn 留痕（定位模型输出格式不合规 vs 模型根本没给 TEACH）。",
  "> - **验证**：全量 **51 链零失败**；tsc=0；vite build=0。",
  "> - **待真机复验（用户本人）**：再说一次明显语法错误/乱句，AI 应反问想说什么或给 TEACH 纠错面板。",
  ">",
  "",
].join("\r\n");
s = s.replace(marker, marker + entry);
fs.writeFileSync(p, s);
console.log("inserted");
