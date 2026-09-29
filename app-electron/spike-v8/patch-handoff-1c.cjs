const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let doc = fs.readFileSync(p, "utf8");
const EOL = "\r\n";
const entry = [
"> 更新：2026-09-27 · **S14-1C 真机裁决片代码完成（#171–#174），待本人实机闸门验收**（全过才批 S14-2 产品化 + migration v16）",
"> - **#171 渲染层最小通话回路**：新建 `src/call/` 四模块——①`pcm-worklet.js`：AudioWorklet 直采，48k→16k 线性插值，Int16/2048 样本（128ms）连续帧（含静音，Server VAD 要求）；②`call-state.ts`：纯函数层（响应文本/音频累积、heardCharEnd 按已听样本比例+词边界吸附、heardPrefix、buildContextTranscript、trimTranscriptToChars、frameLevel）；③`audio-player.ts`：AudioContext 锁 24kHz，int16 PCM 逐块 sample-accurate 排程边收边播，heardSamples 按 ctx 时钟精确统计；④`call-engine.ts`：全双工引擎（见下）。VoiceCallPage 重写为 setup/in-call 两态（气泡、相位灯、电平表、挂断、延迟读数），styles 追加 .vcall-*。",
"> - **#172 barge-in + instructions 对账链路**：双路触发（本地 VadController onSpeechStart / 服务端 speech_started，先到者为准、相位 guard）→ player.stop 记已听样本（muteMs）→ cancel best-effort → 被打断助手轮仅固化已听前缀（heardCharEnd，断词吸附）→ 关旧连接 → 新连接 session.instructions 内嵌 trimTranscriptToChars(…,6000)（relay buildContextInstructions 追加 transcript）→ 环形缓冲 4 帧（~512ms）+重连期间 pendingFrames 在 replayed 后续发 → 回 listening。延迟字段：lastBargeIn.{muteMs,replayMs}、serverToFirstAudioMs（speech_stopped→首块 delta）。麦克风经零增益接 destination 防侧音。",
"> - **#173 测试与验证**：新测试链 `test/call-state.ts` 30 项（累积/已听前缀/transcript 裁剪/电平/打断固化），已挂 npm test。全量 **57 链零失败**；tsc=0；vite build=0（pcm-worklet 经 Vite 以 base64 data URL 内联，addModule 可用）。",
"> - **#174 实机闸门清单**：见 `S14-1C-实机闸门清单.md`（基础收发/Server VAD 多轮/barge-in P0 对账/中文兜底/目标包/30 分钟稳定性/弱网/挂断清理/双 mic AEC）。已知边界：通话未落库（v16 未做）、无结束复盘 UI、review_today 包尚未真正注入弱点资产、MP3 产物未耳听。",
">",
];
const lines = doc.split(EOL);
// 在第 1 行（标题）之后插入
lines.splice(1, 0, entry.join(EOL));
fs.writeFileSync(p, lines.join(EOL));
console.log("S14-1C handoff entry inserted");
