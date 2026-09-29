const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = "# 个人英语能力底座 · 交接文档";
const i = s.indexOf(anchor);
if (i < 0) throw new Error("header anchor not found");
const insertAt = i + anchor.length;

const entry = [
"\r",
"> 更新：2026-09-26（深夜） · **S14-1B 主进程中继封板（#167–#170）**（relay 模块+接线+对账方案真机验证；S14 仍仅 Spike 获批，1C 过闸才批 S14-2 + migration v16）",
"> - **#167 realtime-relay.cjs（主进程中继）**：API Key 只存主进程绝不下发；renderer↔relay 走 MessagePort，下行音频 base64 解码为新 ArrayBuffer 可转移发送（非 JSON IPC）。renderer→relay：connect/audio（PCM 自动包 44B WAV 头）/commit/clear/responseCreate/cancel/itemCreate/reconnect/stop。安全常量：ALLOWED_HOSTS=open.bigmodel.cn、MAX_RENDER_MSG_BYTES=4MB、WS_DRAIN_BYTES=256KB（waitForDrain 轮询、上限 10s）、MAX_PENDING_AUDIO=512。",
"> - **#168 main/preload 接线**：ipcMain.on(\"realtime-open\") 校验 consent.audio/key/safeStorage → 主进程解密 → MessageChannelMain → createRelay → postMessage 转 port1；preload realtimeOpen() 返回 Promise<MessagePort>；relay 日志写 data/main.log。",
"> - **#169 重大发现（推翻 1A §4.3 对策）**：**conversation.item.create 的 message 类 item（input_text/text/input_audio，含完整 id/object/status 形态）在该端点全部静默忽略**——不报错、response.create 后返回空回复（transcript \"\"、无音频）；官方前端 realtimeChat.ts 从不调用 item.create，history 仅本地展示。",
"> - **新对账方案（已真机验证）**：客户端权威历史 → 裁剪后写入新连接 **session.instructions**（\"Conversation so far (authoritative transcript)...\"，被打断助手消息仅含已播前缀）→ append 用户新轮音频 → response.create。replay-probe 两测全过：codeword→\"Blueberry.\"、meeting password→\"Raspberry.\"；重连 157–338ms。relay reconnect 已改为 contextTranscript 方案；error 事件字段按 ev.error.{type,code,message} 嵌套读取；redact 只剥 audio 键、保留文本 delta。",
"> - **#170 测试与验证**：新测试链 test/realtime-relay.cjs 33 项（allowlist/WAV 头/wrapWav/redact/buildContextInstructions），已挂 npm test。全量 **56 链零失败**；tsc=0；vite build=0。",
"> - **下一步**：S14-1C 真机裁决——Client/Server VAD 多轮教学、barge-in 后逐轮核对\"服务端上下文==实际听到\"（instructions 对账新链路）、打断 p50/p95（打断→静音/可录目标 <500ms）、弱网、30 分钟稳定性与内存、输入转写可靠性（不稳定则本地留音频切片+Whisper 批量转写）→ 全过才批 S14-2 + migration v16。",
">",
"",
].join("\r\n");

s = s.slice(0, insertAt) + entry + s.slice(insertAt);
fs.writeFileSync(p, s);
console.log("handoff S14-1B entry inserted");
