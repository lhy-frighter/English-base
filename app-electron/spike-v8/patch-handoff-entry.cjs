const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const entry = [
"",
"> 更新：2026-09-26（晚） · **S14 语音通话入口页（#166）**（协议探针挂起：账户欠费 1113、用户未充值；本轮只做入口与脚手架，无 WebSocket）",
"> - **S14-1A 探针现状（未完成，#165 挂起）**：连接与 `Authorization: Bearer key` 鉴权通过（146–190ms，收 heartbeat/session.created）；session.update 立即被 error 1113「您的账户已欠费」拒绝。免费文字 API（glm-4-flash）实测 200 正常——这是 Realtime 专属付费门槛（音频 0.18 元/分钟）。探针已改为 session.update 报错时优雅记录而非 timeout 崩溃。",
"> - **#166 VoiceCallPage 脚手架（src/VoiceCallPage.tsx）**：功能介绍卡；前置检查（Key 已保存 / 「录音原文上云」同意（页内可直接切换 audio consent）/ 账户余额提示）；目标包四选（自由对话/六级口语/雅思口语/今日弱点）+ 可选话题输入；条件齐备时按钮提示「通道建设中：待充值并完成协议探针」，不发起连接。",
"> - **接线**：左侧导航在「对话」后加「通话」（新 tab `call`）；今日页「其他入口」加「语音通话」tcard；新增 .tcard.selected 样式。",
"> - **验证**：npm test 全链零失败（各链均 0 failed）；tsc=0；vite build=0。",
"> - **下一步（硬前提：bigmodel 充值）**：重跑 spike-v8/probe-realtime.cjs（C PCM 下行 / D MP3 对比 / E **P0 取消后历史一致性** / F server_vad 分块 RIFF 头）→ S14-1B 主进程中继（MessagePort/背压/key 不下发/日志脱敏）→ S14-1C 真机裁决 → 全过才批 S14-2 + migration v16。",
">",
].join("\r\n");
const marker = "# 个人英语能力底座 · 交接文档";
const idx = s.indexOf(marker);
if (idx === -1) { console.log("ANCHOR MISSING"); process.exit(2); }
const lineEnd = s.indexOf("\n", idx);
s = s.slice(0, lineEnd) + entry + s.slice(lineEnd);
fs.writeFileSync(p, s);
console.log("handoff doc entry prepended");
