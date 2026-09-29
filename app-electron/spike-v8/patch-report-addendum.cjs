const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/spike-v8/S14-1A-SPIKE-REPORT.md";
let s = fs.readFileSync(p, "utf8");
const anchor = "- 协议原文：`sdk-ref/GLM-Realtime-doc-for-llm.md`；官方前端参考：`sdk-ref/realtimeChat.ts`、`userStream.ts`、`vad.ts`";
const i = s.indexOf(anchor);
if (i < 0) throw new Error("anchor not found");
const note = [
"",
"---",
"",
"## 修订说明（2026-09-26 深夜，S14-1B 结论）",
"",
"- **§4.3 的「conversation.item.create 重放裁剪历史」对策已被推翻**：S14-1B 实测确认，该端点对 message 类 item（`input_text`/`text`/`input_audio`，含完整 `id`/`object`/`status` 形态）一律静默忽略——不报错，但 `response.create` 后返回空回复（transcript 为空、无音频）。官方前端 `realtimeChat.ts` 从不调用 `conversation.item.create`。",
"- **正式对账方案改为 instructions-as-context**：客户端权威历史裁剪后写入新连接 `session.instructions`（被打断助手消息仅含已播前缀），再 append 用户新轮音频并 `response.create`。`spike-v8/replay-probe.cjs` 两测全过（codeword→\"Blueberry.\"、meeting password→\"Raspberry.\"），重连 157–338ms。",
"- 本报告其余协议事实（鉴权、PCM/MP3 下行、Server VAD 姿势、cancel 不删除已生成内容、收敛时序）均经 S14-1B 复验仍然成立。",
];
const insertAt = i + anchor.length;
s = s.slice(0, insertAt) + note.join("\n") + s.slice(insertAt);
fs.writeFileSync(p, s);
console.log("report addendum inserted");
