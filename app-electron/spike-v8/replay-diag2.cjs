"use strict";
// 诊断2：逐项测试 system item / 文本 item+create / 音频 item+create
const { app, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { createRelay } = require("../realtime-relay.cjs");
app.setPath("userData", path.join(__dirname, "..", "data", "webllm-profile"));

class PortShim {
  constructor() { this.handlers = {}; this.log = true; }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); return this; }
  start() {}
  postMessage(msg) {
    if (this.log) console.log("[→]", JSON.stringify(msg).slice(0, 400));
    (this.handlers.__recv || []).forEach((fn) => fn(msg));
  }
  emit(msg) { (this.handlers.message || []).forEach((fn) => fn(msg)); }
  close() {}
  recv(fn) { (this.handlers.__recv ||= []).push(fn); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SESSION = () => ({
  input_audio_format: "wav", output_audio_format: "mp3",
  instructions: "You are an English tutor. Keep answers very short.",
  turn_detection: { type: "client_vad" },
  beta_fields: { chat_mode: "audio", tts_source: "e2e", auto_search: false },
  tools: [],
});

(async () => {
  await app.whenReady();
  try {
    const { Core } = require("../core.cjs");
    const core = new Core(path.join(__dirname, "..", "data"));
    const key = safeStorage.decryptString(Buffer.from(core.getSetting("cloud_key_cipher", ""), "base64"));
    const port = new PortShim();
    createRelay({ port, apiKey: key, log: (l, m) => console.log("[relay]", l, m) });
    port.emit({ kind: "connect", session: SESSION() });
    await sleep(3500);

    console.log("===== PHASE A: system item =====");
    port.emit({ kind: "reconnect", session: SESSION(),
      items: [{ type: "message", role: "system", content: [{ type: "input_text", text: "Always answer in one word." }] }],
      createAfter: false });
    await sleep(4500);

    console.log("===== PHASE B: user text item + create =====");
    port.emit({ kind: "reconnect", session: SESSION(),
      items: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Say hello in one word." }] }],
      createAfter: true });
    await sleep(7000);

    console.log("===== PHASE C: user audio item + create =====");
    const wav = fs.readFileSync(path.join(__dirname, "audio", "p6-codeword.wav"));
    port.emit({ kind: "reconnect", session: SESSION(),
      items: [
        { type: "message", role: "user", content: [{ type: "input_audio", audio: wav.toString("base64"), transcript: "My secret code word is blueberry." }] },
        { type: "message", role: "user", content: [{ type: "input_text", text: "What is my secret code word? One word." }] },
      ],
      createAfter: true });
    await sleep(9000);
    app.exit(0);
  } catch (e) {
    console.log("DIAG2 ERROR", e && e.stack);
    app.exit(3);
  }
})();
