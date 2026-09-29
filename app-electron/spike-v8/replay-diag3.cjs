"use strict";
// 诊断3：
//  A) 完整形态 item.create（含 id/object/status）
//  B) instructions 携带裁剪历史作为上下文（对账备选方案）
const { app, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { createRelay } = require("../realtime-relay.cjs");
app.setPath("userData", path.join(__dirname, "..", "data", "webllm-profile"));

class PortShim {
  constructor() { this.handlers = {}; }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  start() {}
  postMessage(msg) { console.log("[→]", JSON.stringify(msg).slice(0, 300)); (this.handlers.__recv || []).forEach((fn) => fn(msg)); }
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

    const baseSession = () => ({
      input_audio_format: "wav", output_audio_format: "mp3",
      instructions: "You are an English tutor. Keep answers very short.",
      turn_detection: { type: "client_vad" },
      beta_fields: { chat_mode: "audio", tts_source: "e2e", auto_search: false },
      tools: [],
    });

    console.log("===== PHASE A: 完整形态 item.create + create =====");
    const sessA = baseSession();
    port.emit({ kind: "connect", session: sessA });
    await sleep(3500);
    const fullItem = {
      id: "item_test_0001", object: "realtime.item", type: "message", status: "completed",
      role: "user", content: [{ type: "input_text", text: "Say hello in one word." }],
    };
    port.emit({ kind: "itemCreate", item: fullItem });
    await sleep(1500);
    port.emit({ kind: "responseCreate" });
    await sleep(7000);

    console.log("===== PHASE B: instructions 携带历史 + 新语音轮 =====");
    const sessB = baseSession();
    sessB.instructions = [
      "You are an English tutor in an ongoing voice call. Keep answers very short.",
      "Conversation so far (transcript):",
      "User: My secret code word is blueberry.",
      "Assistant: Got it, I will remember.",
      "Continue the conversation naturally using this transcript as context.",
    ].join("\n");
    port.emit({ kind: "reconnect", session: sessB, items: [], createAfter: false });
    await sleep(4000);
    // 发送 p7 提问音频（client_vad：append→commit→create）
    const p7 = fs.readFileSync(path.join(__dirname, "audio", "p7-ask.wav"));
    port.emit({ kind: "audio", format: "wav", buffer: p7 });
    await sleep(1000);
    port.emit({ kind: "commit" });
    await sleep(500);
    port.emit({ kind: "responseCreate" });
    await sleep(9000);
    app.exit(0);
  } catch (e) {
    console.log("DIAG3 ERROR", e && e.stack);
    app.exit(3);
  }
})();
