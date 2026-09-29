const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const eol = s.includes("\r\n") ? "\r\n" : "\n";
const entry = [
"> 更新：2026-09-26（晚） · **S14-1A GLM Realtime 协议探针封板（#165）**（详见 spike-v8/S14-1A-SPIKE-REPORT.md；S14 仍仅 Spike 获批，1B/1C 过闸才批 S14-2 + migration v16）",
"> - **鉴权/连接**：wss://open.bigmodel.cn/api/paas/v4/realtime，Authorization: Bearer key 请求头（主进程 WebSocket 支持自定义头；JWT query 弃用）；建连 162–295ms；beta_fields 必须嵌套，拍平会报 downstream_reconnect_exceeded。",
"> - **音频实测**：Client VAD = 整 WAV 一次 append → commit → response.create；下行 PCM（73,930B，2 块顺序拼接）/ MP3（43,750B）均可用；response.create → 首个 audio.delta：PCM 1701ms / MP3 1569ms；文本流先于音频。",
"> - **P0 确证（最重要）**：response.cancel 不保证删除已生成内容——E2 独特故事实验中被取消消息逐字保留在服务端历史（40/40 独特词、共享 5-gram 156/156）；E 内燃机实验在文本仍在生成时取消，部分 item 似乎不写入（复述轮为凭用户问题重新作答）。协议无 conversation.item.delete/truncate。",
"> - **强制对策（写入 S14-2）**：barge-in 后做历史对账——立即停播记 played_char_end + response.cancel + 过滤旧 response_id → 新建 WS → conversation.item.create 重放裁剪后历史（被打断助手消息仅保留已播前缀）→ response.create；重连 200–300ms 与用户说话时间重叠；input_audio item 重放能力待 1B 验证。",
"> - **Server VAD 正确姿势（F4 通过）**：2048 样本（16kHz 下 128ms）完整 WAV 帧持续发送（含静音），语音内容后再发 ~3s 静音帧 → speech_started/speech_stopped/committed → 自动 response；F1–F3「只发语音、发完即止」及裸 PCM 全部失败。Server VAD 无需客户端 commit。",
"> - **取消时序**：response.cancel → response.done 收敛 99–123ms；打断闭环 = speech_started → 清本地队列 → cancel → 忽略旧 delta → 等收敛。",
"> - **下一步**：S14-1B 主进程中继（Key 只存主进程不下发 / MessagePort + 可转移 ArrayBuffer / host allowlist / 消息大小与 bufferedAmount 背压 / 日志脱敏 / 验证音频 item 重放）→ S14-1C 真机裁决（逐轮对账核对、打断 p50/p95、弱网、30 分钟稳定性、转写可靠性）→ 全过才批 S14-2 + migration v16。",
">",
"",
].join(eol);
const lines = s.split(eol);
// 在第 1 行（标题）之后插入
lines.splice(1, 0, entry);
fs.writeFileSync(p, lines.join(eol));
console.log("inserted, new length", fs.statSync(p).size);
