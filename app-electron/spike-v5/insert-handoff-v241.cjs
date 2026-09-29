const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = "# 个人英语能力底座 · 交接文档\r\n";
if (!s.startsWith(anchor)) throw new Error("doc anchor not found");
const entry = [
"> 更新：2026-09-24 · 版本 v2.41.0（**#135–#137 VAD 免提对话：Silero 常开麦自动断句 + barge-in 打断**）",
"> - **#135 vendor 落地 + smoke**：手工 vendor `@ricky0123/vad-web@0.0.31`（**ISC**）与 `onnxruntime-web@1.22.0`（MIT）；随包资产 `vendor/silero-vad/`：silero_vad_v5.onnx（2,327,524B）、vad.worklet.bundle.min.js（2,480B），bytes/sha256 写入 `src/conversation/vad-manifest.ts`，启动逐文件校验。vite copyVad 插件拷 VAD 两文件 + ort threaded mjs/wasm 至 dist/vad。VAD 体小且须与 TTS 同时运行（barge-in 检测），**不进 InferenceCoordinator 互斥租约**，由对话页管理。",
"> - **smoke 卡点与修复**：自动化 smoke 初报 `Failed to resolve module specifier 'worker_threads'`——两处根因：①runner 在 app ready 前创建 BrowserWindow（改为 whenReady 内创建）；②smoke 页开 nodeIntegration，ort threaded glue 的环境检测误走 Node 路径（threaded mjs 检测 `process.type!=='renderer'` 后 import('worker_threads')）。改为把真实录音 base64 内嵌（vad-smoke-audio.ts）、页面无 nodeIntegration 同生产环境，smoke 通过并保持 PASS。",
"> - **#136 免提回路**：`vad-controller.ts` 加 onSpeechRealStart 与自定义 getStream（echoCancellation/noiseSuppression/autoGainControl 全开）。ConversationPage 加「免提：开/关」：",
">   - 空闲时 onSpeechEnd → 暂停 VAD → whisper-base 转写 → send 进入 busy 后才恢复 VAD（autoPending/onStarted 防间隙重复成轮，1.5s 兜底恢复）；",
">   - AI 播放/生成中 onSpeechRealStart → barge-in：speaker.stop 即时静音 + engine.interrupt；该段语音结束后等旧轮收敛再自动成下一轮；",
">   - 输入栏在免提时改为状态胶囊（聆听中 / 你在说话 / AI 说话中，可直接开口打断），上方动态提示；「新话题」「结束并复盘」均销毁 VAD 释放麦克风。",
"> - **#137 验证**：tsc=0；vite build=0；全量 **npm test 43 链零失败**；VAD smoke PASS（真实录音注入，起止回调触发）。",
"> - **待用户真机闸门（只能本人，耳听+麦克风）**：①开免提说一句→自动转写发送→AI 出声，全程无手按；②AI 播放中直接开口→立即静音、你的话自动成下一轮；③关免提后麦克风释放；④「新话题」/「结束并复盘」后 VAD 销毁、无残留监听；⑤外放场景（不戴耳机）观察 AI 声音是否误触发 barge-in（建议戴耳机）。",
"> - **下一步（待裁决）**：#138 云端发音/语法深度分析 + 错误一键成卡；ASR 封板剩余真机闸门仍挂账。",
">",
">",
].join("\r\n");
fs.writeFileSync(p, anchor + entry + s.slice(anchor.length));
console.log("handoff v2.41.0 inserted");
