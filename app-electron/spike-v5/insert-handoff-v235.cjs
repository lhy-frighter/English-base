const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const nl = "\r\n";
const anchor = "# 个人英语能力底座 · 交接文档" + nl;
if (!s.startsWith(anchor)) throw new Error("header anchor missing");
const entry = [
"> 更新：2026-09-24 · 版本 v2.35.0（**#123 V8-2c：token 预算滑动窗口 + 运行摘要**）",
"> - **背景**：V8-1 spike 发现 prebuilt wasm 仅 cs1k（约 1024 token），旧实现固定取最近 8 条，长对话必然溢出且无压缩。本片改为按 token 预算选窗、旧轮次摘要化。",
"> - **新模块 src/conversation/context-window.ts**（纯函数）：",
">   - estimateTokens：CJK 字符约 1 token、其余按 4 字符/token 的粗估；",
">   - 常量 CTX_TOTAL=1024、RESERVE_OUTPUT=260（maxTokens 220+纠错余量）、RESERVE_SYSTEM=220，HISTORY_TOKEN_BUDGET=544；",
">   - selectWindow：从最新一条往回选直到预算用完，保持时间顺序返回 {window, overflow}；最新一条（用户刚发的话）即使超长也一定保留；",
">   - SUMMARY_SYSTEM_PROMPT（≤8 条英文要点：关键事实/决定/反复出现的错误，≤120 词）与 summaryUserMessage（拼接旧摘要+溢出轮次）。",
"> - **ConversationPage 接线**：",
">   - summaryRef 保存运行摘要（仅内存，重开会话从空开始、首次发送时按同样机制重建）；新会话/开历史/回设置时清空；compacting 状态显示「整理较早的对话…」。",
">   - send：全部已完成/user 轮次经 selectWindow 选窗；overflow 非空时先用 localEngine.stream（temperature 0.2/maxTokens 180）压缩，摘要以 system 消息「Earlier conversation summary (for context only)」置于 system 之后、原始窗口之前，再发正式回复。",
">   - endSession：复盘同样走窗口+摘要（无摘要且有溢出时先压缩），保证复盘覆盖整段对话而非仅最近 10 条。",
">   - **原则**：摘要只作提示上下文，不是学习事实源——原始轮次、纠错、成卡证据永远以 conversation_turns 为准，不被摘要覆盖。",
"> - **新测试链 test/conv-context.ts**（node --experimental-strip-types，已加入 npm test，位于 conv-session 后）：token 估算（英文/CJK/混合）、空输入、预算内全保留且顺序不乱、超预算窗口+溢出完整且窗口 token 合预算、单条超长仍保留最新、自定义预算、摘要请求拼接——17 checks。",
"> - **验证**：全量 npm test 零失败（**41 链**）；tsc=0；vite build=0。",
"> - **待用户真机闸门**：聊过预算阈值（约 8–10 轮长句）时出现「整理较早的对话…」，之后 AI 仍记得较早话题的关键信息；结束复盘内容覆盖整场。",
"> - 下一步：#124 V8-2d 云端显式同意三开关（学习画像/历史文本/录音原文独立开关）+ safeStorage 加密 API key。",
].join(nl) + nl;
s = anchor + entry + s.slice(anchor.length);
fs.writeFileSync(p, s);
console.log("handoff v2.35.0 inserted");
