"use strict";
// S14-1B：GLM Realtime 主进程中继
// - 主进程持有 API Key（绝不下发 renderer），用纯 JS WebSocket + 自定义 Authorization 头
// - renderer ↔ main 走 MessagePort；音频块以可转移 ArrayBuffer 传输，禁止音频走 JSON IPC
// - host allowlist / 消息大小限制 / 发送队列上限 / bufferedAmount 背压
// - 日志脱敏：不记 key、不记完整 URL（只记 host）、不记音频 base64
const DEFAULT_ENDPOINT = "wss://open.bigmodel.cn/api/paas/v4/realtime";
const ALLOWED_HOSTS = new Set(["open.bigmodel.cn"]);
const MAX_RENDER_MSG_BYTES = 4 * 1024 * 1024; // 单条 renderer 消息（含音频）上限
const WS_DRAIN_BYTES = 256 * 1024;            // bufferedAmount 超此值则等待排空
const MAX_PENDING_AUDIO = 512;                // 待发送音频帧上限（超出即报背压错误）
const DRAIN_WAIT_MS = 10_000;
const ITEM_ACK_MS = 2_000;

// —— 纯函数（供单测）——

function isAllowedEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return (u.protocol === "wss:" || u.protocol === "https:") && ALLOWED_HOSTS.has(u.hostname);
  } catch { return false; }
}

// 16-bit PCM / mono WAV 头
function buildWavHeader(pcmBytes, sampleRate) {
  const buf = Buffer.alloc(44);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + pcmBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);          // PCM chunk size
  buf.writeUInt16LE(1, 20);           // PCM format
  buf.writeUInt16LE(1, 22);           // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // bytes/sec
  buf.writeUInt16LE(2, 32);           // block align
  buf.writeUInt16LE(16, 34);          // bits/sample
  buf.write("data", 36);
  buf.writeUInt32LE(pcmBytes, 40);
  return buf;
}

function wrapWav(pcmBuffer, sampleRate) {
  const pcm = Buffer.from(pcmBuffer);
  return Buffer.concat([buildWavHeader(pcm.length, sampleRate), pcm]);
}

// 深拷贝并剥离 base64/敏感字段，保证日志与转发安全
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "audio") { out[k] = "<redacted:" + sizeOf(v) + ">"; continue; }
      if (k === "Authorization" || k === "api_key" || k === "token") { out[k] = "<redacted>"; continue; }
      out[k] = redact(v);
    }
    return out;
  }
  return value;
}

function sizeOf(v) {
  if (typeof v === "string") return "str:" + v.length;
  return typeof v;
}

function nowTs() { return Date.now(); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// —— 中继 ——

class RealtimeRelay {
  // opts.allowAnyEndpoint 仅供本地回环集成测试关闭 allowlist（生产缺省 false）
  constructor({ port, apiKey, endpoint, log, allowAnyEndpoint }) {
    this.port = port;
    this.apiKey = String(apiKey || "");
    this.endpoint = endpoint || DEFAULT_ENDPOINT;
    this.log = log || (() => {});
    this.allowAny = !!allowAnyEndpoint;
    this.ws = null;
    this.sendChain = Promise.resolve();
    this.pendingAudio = 0;
    this.closed = false;
    this.seq = 0;
    this.waiters = new Map(); // type -> [{predicate, resolve, reject, timer}]
  }

  safeUrl() { try { return new URL(this.endpoint).hostname; } catch { return "invalid-host"; } }

  start() {
    if (!this.allowAny && !isAllowedEndpoint(this.endpoint)) {
      this.fail("endpoint 不在 allowlist 中：" + this.safeUrl());
      return;
    }
    if (!this.apiKey) { this.fail("缺少 API key"); return; }
    // Electron MessagePortMain 的 message 事件参数是 {data, ports} 包装；
    // worker_threads MessagePort（单测）则直接给值。这里归一成消息体。
    this.port.on("message", (ev) => {
      const msg = (ev && typeof ev === "object" && !Array.isArray(ev) && "data" in ev && ev.data !== undefined) ? ev.data : ev;
      this.onPortMessage(msg);
    });
    this.port.on("close", () => this.teardown("port-closed"));
    this.port.start?.();
    this.log("info", "relay started, host=" + this.safeUrl());
  }

  post(obj, transfers) {
    if (this.closed) return;
    if (transfers) this.port.postMessage(obj, transfers);
    else this.port.postMessage(obj);
  }

  fail(message) {
    this.post({ kind: "error", message: String(message) });
    this.log("warn", "relay error: " + message);
  }

  // —— renderer → server ——

  onPortMessage(msg) {
    try {
      if (!msg || typeof msg !== "object") {
        const what = typeof msg === "object" && msg !== null
          ? msg.constructor?.name || "object"
          : typeof msg + ":" + String(msg).slice(0, 30);
        throw new Error("非法消息: " + what);
      }
      const size = msg.buffer ? msg.buffer.byteLength || 0 : 0;
      if (size > MAX_RENDER_MSG_BYTES) throw new Error("消息超过大小限制（" + size + "）");
      switch (msg.kind) {
        case "connect":
          void this.connect(msg.session || {});
          break;
        case "audio":
          this.queueAudio(msg);
          break;
        case "commit":
          void this.wsSend({ type: "input_audio_buffer.commit", client_timestamp: nowTs() });
          break;
        case "clear":
          void this.wsSend({ type: "input_audio_buffer.clear", client_timestamp: nowTs() });
          break;
        case "responseCreate":
          void this.wsSend({ type: "response.create", client_timestamp: nowTs() });
          break;
        case "cancel":
          void this.wsSend({ type: "response.cancel", client_timestamp: nowTs() });
          break;
        case "itemCreate":
          if (!msg.item) throw new Error("itemCreate 缺少 item");
          void this.wsSend({ type: "conversation.item.create", item: msg.item, client_timestamp: nowTs() });
          break;
        case "reconnect":
          void this.reconnect(msg.session || {}, msg.contextTranscript || "", !!msg.createAfter);
          break;
        case "stop":
          this.teardown("client-stop");
          break;
        default:
          throw new Error("未知指令: " + msg.kind);
      }
    } catch (e) {
      this.fail(e && e.message ? e.message : String(e));
    }
  }

  queueAudio(msg) {
    if (!msg.buffer) return this.fail("audio 消息缺少 buffer");
    if (!this.sawAudio) {
      this.sawAudio = true;
      this.log("info", "first audio frame, " + msg.buffer.byteLength + "B, rate=" + (msg.sampleRate || 16000));
    }
    if (this.pendingAudio >= MAX_PENDING_AUDIO) {
      return this.fail("发送队列背压：待发音频超过上限 " + MAX_PENDING_AUDIO);
    }
    this.pendingAudio++;
    const sampleRate = msg.sampleRate || 16000;
    let wavBytes;
    if (msg.format === "wav") wavBytes = Buffer.from(msg.buffer);
    else wavBytes = wrapWav(msg.buffer, sampleRate);
    const b64 = wavBytes.toString("base64");
    this.sendChain = this.sendChain
      .then(() => this.wsSendRaw({ type: "input_audio_buffer.append", audio: b64, client_timestamp: nowTs() }))
      .catch((e) => this.fail("音频上行失败: " + (e && e.message)))
      .finally(() => { this.pendingAudio--; });
  }

  // —— WebSocket ——

  async connect(session) {
    // 失败必须以 {kind:"error"} 通知 renderer 并清理，绝不把 rejection 留给 void 调用方（否则 renderer 卡「连接中」）
    try {
      if (this.ws) this.detachWs();
      this.lastSession = { ...session };
      const t0 = Date.now();
      const ws = new WebSocket(this.endpoint, {
        headers: { Authorization: "Bearer " + this.apiKey },
      });
      this.ws = ws;
      await new Promise((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = (e) => reject(new Error("WebSocket 连接失败（" + (e?.message || "error") + "）"));
      });
      this.attachWs(ws);
      const connectMs = Date.now() - t0;
      this.log("info", "ws open, connectMs=" + connectMs);
      this.post({ kind: "open", connectMs });
      // 等 session.created，再发 session.update，再等 session.updated
      await this.waitFor("session.created", 10_000);
      ws.send(JSON.stringify({ type: "session.update", session, client_timestamp: nowTs() }));
      await this.waitFor("session.updated", 10_000);
      this.post({ kind: "ready" });
      this.log("info", "session ready");
      return true;
    } catch (e) {
      this.detachWs();
      this.fail(e && e.message ? e.message : String(e));
      return false;
    }
  }

  attachWs(ws) {
    ws.onmessage = (ev) => {
      let data;
      try { data = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString()); }
      catch { this.log("warn", "ws 非 JSON 消息，已忽略"); return; }
      this.onServerEvent(data);
    };
    ws.onerror = (e) => {
      this.log("warn", "ws error event: " + (e?.message || "unknown"));
    };
    ws.onclose = (e) => {
      this.log("info", "ws closed code=" + e.code);
      this.post({ kind: "closed", code: e.code, reason: e.reason || "" });
    };
  }

  detachWs() {
    const ws = this.ws;
    if (!ws) return;
    ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null;
    try { ws.close(1000, "relay-detach"); } catch { /* noop */ }
    this.ws = null;
    this.rejectAllWaiters("ws detached");
  }

  onServerEvent(ev) {
    if (!ev || !ev.type) return;
    // 关键语音事件落日志（只记类型不记内容），便于定位"听不到/不响应"类问题
    if (ev.type === "input_audio_buffer.speech_started" || ev.type === "input_audio_buffer.speech_stopped"
      || ev.type === "input_audio_buffer.committed"
      || ev.type === "conversation.item.input_audio_transcription.completed"
      || ev.type === "response.created" || ev.type === "response.done"
      || ev.type === "response.cancel" || ev.type === "error") {
      const extra = ev.response_id ? " " + ev.response_id : "";
      this.log("info", "evt " + ev.type + extra);
    }
    this.pumpWaiters(ev);
    if (ev.type === "error") {
      const info = ev.error || {};
      this.post({ kind: "serverError", errorType: info.type || "", code: info.code || "", message: info.message || "" });
      this.log("warn", "server error type=" + info.type + " code=" + info.code + " msg=" + info.message);
      return;
    }
    if (ev.type === "response.audio.delta") {
      const bytes = Buffer.from(ev.delta || "", "base64");
      const ab = new ArrayBuffer(bytes.length);
      new Uint8Array(ab).set(bytes);
      // Electron MessagePortMain 的 transfer 列表只接受端口对象；ArrayBuffer 走消息体结构化克隆
      // （同进程零拷贝拷贝，跨进程仍按二进制通道传输，绝不 JSON 字符串化）
      this.post({
        kind: "audioDelta",
        responseId: ev.response_id || "",
        outputIndex: ev.output_index ?? 0,
        contentIndex: ev.content_index ?? 0,
        buffer: ab,
      });
      return;
    }
    // 其余事件转发（剥离任何 base64 字段）
    this.post({ kind: "event", event: redact(ev) });
  }

  // —— 重连 + 历史重放（barge-in 对账）——

  // barge-in 对账：客户端权威历史 → 裁剪后写入新连接 instructions（GLM 端点不支持消息 item 重放）
  buildContextInstructions(session, contextTranscript) {
    const base = session.instructions || "";
    if (!contextTranscript) return base;
    return [
      base,
      "",
      "Conversation so far (authoritative transcript; treat as context):",
      contextTranscript,
      "Continue the conversation naturally from this transcript.",
    ].join("\n");
  }

  async reconnect(session, contextTranscript, createAfter) {
    this.log("info", "reconnect with contextTranscript chars=" + contextTranscript.length);
    const nextSession = { ...session };
    nextSession.instructions = this.buildContextInstructions(session, contextTranscript);
    this.detachWs();
    const ok = await this.connect(nextSession);
    if (!ok) return; // connect 失败已发 error，renderer 负责恢复聆听态
    this.post({ kind: "replayed", contextChars: contextTranscript.length });
    if (createAfter) {
      await this.wsSendRaw({ type: "response.create", client_timestamp: nowTs() });
    }
  }

  // —— 发送原语 + 背压 ——

  async wsSend(obj) {
    return this.sendChain.then(() => this.wsSendRaw(obj));
  }

  async wsSendRaw(obj) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) throw new Error("WebSocket 未连接");
    if (ws.bufferedAmount > WS_DRAIN_BYTES) await this.waitForDrain(ws);
    ws.send(JSON.stringify(obj));
  }

  waitForDrain(ws) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const timer = setInterval(() => {
        if (ws.bufferedAmount <= WS_DRAIN_BYTES) { clearInterval(timer); resolve(); }
        else if (Date.now() - t0 > DRAIN_WAIT_MS) { clearInterval(timer); reject(new Error("发送缓冲排空超时")); }
      }, 20);
    });
  }

  // —— 事件等待 ——

  waitFor(type, timeoutMs) {
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        const arr = this.waiters.get(type);
        if (arr) {
          const i = arr.indexOf(entry);
          if (i >= 0) arr.splice(i, 1);
        }
        reject(new Error("等待事件超时: " + type));
      }, timeoutMs);
      const arr = this.waiters.get(type) || [];
      arr.push(entry);
      this.waiters.set(type, arr);
    });
  }

  pumpWaiters(ev) {
    const arr = this.waiters.get(ev.type);
    if (!arr || !arr.length) return;
    for (const w of arr.splice(0)) {
      clearTimeout(w.timer);
      w.resolve(ev);
    }
  }

  rejectAllWaiters(reason) {
    for (const [, arr] of this.waiters) {
      for (const w of arr.splice(0)) {
        clearTimeout(w.timer);
        w.reject(new Error(reason));
      }
    }
  }

  teardown(reason) {
    if (this.closed) return;
    this.closed = true;
    this.log("info", "relay teardown: " + reason);
    this.detachWs();
    try { this.port.close?.(); } catch { /* noop */ }
  }
}

function createRelay(options) {
  const relay = new RealtimeRelay(options);
  relay.start();
  return relay;
}

module.exports = {
  createRelay,
  RealtimeRelay,
  isAllowedEndpoint,
  buildWavHeader,
  wrapWav,
  redact,
  DEFAULT_ENDPOINT,
  ALLOWED_HOSTS,
  MAX_RENDER_MSG_BYTES,
};
