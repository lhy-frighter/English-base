"use strict";
// 诊断：打印重放过程中全部服务端事件与错误
const { app, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { createRelay } = require("../realtime-relay.cjs");
app.setPath("userData", path.join(__dirname, "..", "data", "webllm-profile"));

class PortShim {
  constructor() { this.handlers = {}; }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  start() {}
  postMessage(msg) {
    console.log("[→renderer]", JSON.stringify(msg).slice(0, 600));
    (this.handlers.__recv || []).forEach((fn) => fn(msg));
  }
  emit(msg) { (this.handlers.message || []).forEach((fn) => fn(msg)); }
  close() {}
  recv(fn) { (this.handlers.__recv ||= []).push(fn); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await app.whenReady();
  try {
    const { Core } = require("../core.cjs");
    const core = new Core(path.join(__dirname, "..", "data"));
    const key = safeStorage.decryptString(Buffer.from(core.getSetting("cloud_key_cipher", ""), "base64"));
    const port = new PortShim();
    createRelay({ port, apiKey: key, log: (l, m) => console.log("[relay]", l, m) });
    const session = {
      input_audio_format: "wav", output_audio_format: "mp3",
      instructions: "You are an English tutor. Keep answers very short.",
      turn_detection: { type: "client_vad" },
      beta_fields: { chat_mode: "audio", tts_source: "e2e", auto_search: false },
      tools: [],
    };
    port.emit({ kind: "connect", session });
    await sleep(4000);

    // 只重放一条 user 文本 item
    const items = [
      { type: "message", role: "user", content: [{ type: "input_text", text: "What is the meeting password? One word." }] },
    ];
    port.emit({ kind: "reconnect", session, items, createAfter: false });
    await sleep(5000);
    app.exit(0);
  } catch (e) {
    console.log("DIAG ERROR", e && e.stack);
    app.exit(3);
  }
})();
