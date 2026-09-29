"use strict";
// S14-1B 对账方案验证探针（最终版）：
//  客户端权威历史 → 裁剪后写入新连接 instructions → 新语音轮
//  测试1：历史中 codeword=blueberry，用户语音追问 → 期望 blueberry
//  测试2：历史中 meeting password=raspberry（模拟被打断助手消息的已播前缀），语音追问 → 期望 raspberry
// 运行：npx electron spike-v8/replay-probe.cjs
const { app, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { createRelay } = require("../realtime-relay.cjs");

app.setPath("userData", path.join(__dirname, "..", "data", "webllm-profile"));

class PortShim {
  constructor() { this.handlers = {}; }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  start() {}
  postMessage(msg) { (this.handlers.__recv || []).forEach((fn) => fn(msg)); }
  emit(msg) { (this.handlers.message || []).forEach((fn) => fn(msg)); }
  close() { (this.handlers.close || []).forEach((fn) => fn()); }
  recv(fn) { (this.handlers.__recv ||= []).push(fn); }
}

function baseSession() {
  return {
    input_audio_format: "wav",
    output_audio_format: "mp3",
    instructions: "You are an English tutor in an ongoing voice call. Keep answers very short.",
    turn_detection: { type: "client_vad" },
    beta_fields: { chat_mode: "audio", tts_source: "e2e", auto_search: false },
    tools: [],
  };
}

function wait(port, pred, timeoutMs) {
  return new Promise((resolve, reject) => {
    const seen = [];
    const fn = (msg) => {
      seen.push(msg.kind || (msg.event && msg.event.type));
      if (pred(msg)) { port.handlers.__recv.splice(port.handlers.__recv.indexOf(fn), 1); resolve(msg); }
    };
    port.recv(fn);
    setTimeout(() => reject(new Error("等待超时，最近: " + JSON.stringify(seen.slice(-6)))), timeoutMs);
  });
}

// 一次"新连接 + 上下文 + 语音提问"的完整轮次
async function askOnce(port, contextTranscript, askWavPath) {
  port.emit({ kind: "reconnect", session: baseSession(), contextTranscript, createAfter: false });
  await wait(port, (m) => m.kind === "replayed", 15000);
  const wav = fs.readFileSync(askWavPath);
  port.emit({ kind: "audio", format: "wav", buffer: wav });
  await new Promise((r) => setTimeout(r, 800));
  port.emit({ kind: "commit" });
  await new Promise((r) => setTimeout(r, 400));
  port.emit({ kind: "responseCreate" });
  let transcript = "";
  const done = await wait(port, (m) => {
    if (m.kind === "event" && m.event.type === "response.audio_transcript.delta") transcript += m.event.delta;
    return m.kind === "event" && m.event.type === "response.done";
  }, 20000);
  return { transcript, status: done.event.response?.status };
}

(async () => {
  await app.whenReady();
  const result = { startedAt: new Date().toISOString(), tests: {} };
  try {
    const { Core } = require("../core.cjs");
    const core = new Core(path.join(__dirname, "..", "data"));
    const cipherText = core.getSetting("cloud_key_cipher", "");
    if (!cipherText) throw new Error("no key saved");
    const key = safeStorage.decryptString(Buffer.from(cipherText, "base64"));

    const port = new PortShim();
    createRelay({ port, apiKey: key, log: (l, m) => console.log("[relay]", l, m) });

    // 初始连接（模拟通话开始）
    port.emit({ kind: "connect", session: baseSession() });
    await wait(port, (m) => m.kind === "ready", 15000);

    // 测试1
    const ctx1 = [
      "User: My secret code word is blueberry.",
      "Assistant: Got it, I will remember that.",
    ].join("\n");
    const r1 = await askOnce(port, ctx1, path.join(__dirname, "audio", "p7-ask.wav"));
    const pass1 = /blueberry/i.test(r1.transcript);
    result.tests.context_codeword = { pass: pass1, ...r1 };
    console.log("TEST1:", pass1, "->", r1.transcript);

    // 测试2：助手消息仅保留"已播前缀"（对账裁剪语义）
    const ctx2 = [
      "Assistant (heard prefix): Remember, the meeting password is raspberry.",
    ].join("\n");
    const r2 = await askOnce(port, ctx2, path.join(__dirname, "audio", "p8-ask2.wav"));
    const pass2 = /raspberry/i.test(r2.transcript);
    result.tests.context_meeting_password = { pass: pass2, ...r2 };
    console.log("TEST2:", pass2, "->", r2.transcript);

    port.emit({ kind: "stop" });
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(__dirname, "replay-probe.json"), JSON.stringify(result, null, 2));
    console.log("RESULT", JSON.stringify({ t1: pass1, t2: pass2 }));
    app.exit(pass1 && pass2 ? 0 : 2);
  } catch (e) {
    result.error = e && e.stack ? e.stack : String(e);
    fs.writeFileSync(path.join(__dirname, "replay-probe.json"), JSON.stringify(result, null, 2));
    console.log("PROBE ERROR", e && e.message);
    app.exit(3);
  }
})();
