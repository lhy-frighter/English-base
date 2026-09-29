const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");

const entry = [
  "> 更新：2026-09-24 · 版本 v2.37.0（**V8-3 语音全链路 #126–#129：LLM 租约 + 按键说话 + 流式逐句 TTS + 打断/崩溃恢复**）",
  "> - **#126 V8-3a coordinator LLM 租约**：`src/inference/coordinator.ts` 重写——状态拆为 turn（asr/translation/tts）+ llm；新增 kind \"llm\"：acquire(\"llm\") 先 teardownTurn 再置 llm；ASR/TTS/翻译按轮获取时只销毁另外两方，**LLM 会话级常驻不销毁**；release(\"llm\") 调 localEngine.unload()。`local-engine.ts` 加 async unload()。真机 lease smoke（`src/spike-v8/lease-smoke.ts`，main.cjs APP_V8_LEASE_SMOKE）全绿：llm 加载→asr 就绪（llm 仍在）→tts 就绪（asr 已销毁、llm 仍在）→全部释放，V8LEASE DONE。注：heapMB 取 performance.memory，不含 WASM/Worker/WebGPU 堆，真实 RSS 待真机。",
  "> - **#127 V8-3b 按键说话**：新模块 `src/conversation/voice-input.ts`（startCapture：getUserMedia + MediaRecorder，stop 时 decodeToPcm16k；已知边界：若编码延迟影响松键转写再改 AudioWorklet）。ConversationPage 加 mic 按钮（录音/停止/识别中，红色 .mic-on）、ASR 确认条（识别文本可编辑，回车/点发送，取消）；松键→转写完成延迟记录 latencyRef.asr。",
  "> - **#128 V8-3c 流式逐句 TTS**：`tts-chunks.ts` 加 drainSentences（maskProtected 后按句末标点/换行抽句，末段残余保留；修复首版 pop 导致的多句顺序颠倒）；`tts.ts` 加 startStreamingSpeaker——Kokoro 路径按句 planKokoroChunks→synthChunk→AudioContext gapless 调度，SAPI 路径逐句 SpeechSynthesisUtterance，无引擎/静音模式游标随全文推进；维护 playedCharEnd，sKeep 4s 保活。ConversationPage 出声开关（默认开，显示\"播放中\"），首 token/首音延迟记录。",
  "> - **#129 V8-3d 打断 + 崩溃恢复**：header 加「打断」按钮——speaker.stop() 即时静音（mute 延迟）、localEngine.interrupt()、send 循环 stopRequested 立即 break；中断轮 status=interrupted，**committedText=reply.slice(0,playedCharEnd) 只提交已播前缀**（reRecord 延迟）。历史构建（send 与 endSession）纳入 interrupted 轮的 committedText，未播文本不复活；中断气泡只显示已播前缀+（已打断）。core.cjs 加 convRecover()（generating→failed/error_code interrupted_by_restart；speaking→interrupted/interrupted_at），main.cjs 启动备份后调用，恢复失败不影响启动。",
  "> - **测试**：tts-chunks 加 drainSentences 6 checks（共 67 passed）；conv-session 加 convRecover/中断前缀 5 checks。全量 **npm test 零失败（42 链）**；tsc=0；vite build=0（copy-ort-wasm4/copy-bergamot6/copy-legal3）；main/core 语法通过。",
  "> - **待用户真机闸门（只能本人）**：①完整语音轮次：点 mic 说话→松键转写→确认→AI 出声回答；②播放中点「打断」立即静音、可立刻再说话；③五段延迟（松键→转写、确认→首 token、确认→首音、打断→静音、打断→重新可录）实际数值；④杀进程重开后未完成轮变 failed/interrupted，已播前缀仍在；⑤ASR→TTS→再 ASR 各阶段 RSS 回落。",
  "> - **下一步（待裁决）**：V8-4 云端 Provider 接入（「本次/长期」显式发送弹窗），或回到其他优化项；ASR 封板剩余真机闸门（30 分钟连续转写等）仍挂账。",
  ">",
  "",
].join("\r\n");

const header = "# ";
if (!s.startsWith(header)) throw new Error("doc header missing");
const nl = s.indexOf("\n");
s = s.slice(0, nl + 1) + "\n" + entry + s.slice(nl + 1);
fs.writeFileSync(p, s);
console.log("handoff v2.37.0 inserted");
