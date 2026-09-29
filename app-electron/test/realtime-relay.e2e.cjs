// S14 通话链路集成测试（免网络、零依赖）：
// 内置一个最小 RFC6455 WebSocket 假服务端（只支持文本帧、客户端掩码解析），驱动真实
// realtime-relay.cjs 走完整通话协议闭环：
//   connect 握手 → session.created/update → WAV 包帧上行 → response 流下行（文本+音频转移）
//   → response.cancel → reconnect（instructions 内嵌上下文对账）→ stop 收尾。
// 运行：node test/realtime-relay.e2e.cjs
const http = require("node:http");
const crypto = require("node:crypto");
const { MessageChannel } = require("node:worker_threads");
const { createRelay, wrapWav } = require("../realtime-relay.cjs");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

// —— 最小 WebSocket 服务端（RFC6455 子集：文本帧 + 掩码解析 + 服务端不掩码发送）——
function wsEncodeText(str) {
  const payload = Buffer.from(str, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

class MockWsConn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.onmessage = null;
    this.onclose = null;
    socket.on("data", (d) => this.feed(d));
    socket.on("close", () => this.onclose?.());
    socket.on("error", () => this.onclose?.());
  }
  feed(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (true) {
      if (this.buf.length < 2) return;
      const opcode = this.buf[0] & 0x0f;
      const masked = (this.buf[1] & 0x80) !== 0;
      let len = this.buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      let mask = null;
      if (masked) { if (this.buf.length < off + 4) return; mask = this.buf.subarray(off, off + 4); off += 4; }
      if (this.buf.length < off + len) return;
      const payload = Buffer.from(this.buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      this.buf = this.buf.subarray(off + len);
      if (opcode === 1) this.onmessage?.(payload.toString("utf8"));
      else if (opcode === 8) { try { this.socket.end(); } catch { /* noop */ } this.onclose?.(); }
    }
  }
  sendText(str) { this.socket.write(wsEncodeText(str)); }
  close() { try { this.socket.destroy(); } catch { /* noop */ } }
}

function startMockRealtimeServer() {
  const state = {
    connections: 0,
    sessionUpdates: [],        // 每次 session.update 的 session 体
    appends: [],               // input_audio_buffer.append 的 base64
    cancels: 0,
    responseCreates: 0,
    conns: [],                 // MockWsConn[]
  };
  const server = http.createServer(() => {});
  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
    const conn = new MockWsConn(socket);
    state.conns.push(conn);
    state.connections++;
    conn.onmessage = (text) => {
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      switch (msg.type) {
        case "session.update":
          state.sessionUpdates.push(msg.session || {});
          conn.sendText(JSON.stringify({ type: "session.updated", session: msg.session || {} }));
          break;
        case "input_audio_buffer.append":
          state.appends.push(msg.audio || "");
          break;
        case "response.create": {
          state.responseCreates++;
          conn.sendText(JSON.stringify({ type: "response.created", response: { id: "r1" } }));
          conn.sendText(JSON.stringify({ type: "response.audio_transcript.delta", response_id: "r1", delta: "Hello " }));
          conn.sendText(JSON.stringify({ type: "response.audio_transcript.delta", response_id: "r1", delta: "there." }));
          const pcm = Buffer.alloc(4800); // 2400 int16 样本 = 100ms @24k
          conn.sendText(JSON.stringify({ type: "response.audio.delta", response_id: "r1", delta: pcm.toString("base64") }));
          conn.sendText(JSON.stringify({ type: "response.done", response_id: "r1" }));
          break;
        }
        case "response.cancel":
          state.cancels++;
          conn.sendText(JSON.stringify({ type: "response.done", response_id: "r1" }));
          break;
        default:
          break;
      }
      if (state.connections === 1) conn.sendText(JSON.stringify({ type: "session.created", session: { id: "s1" } }));
    };
    // 每条新连接都先发 session.created（放在 onmessage 外立即发亦可；这里连接后即发）
    conn.sendText(JSON.stringify({ type: "session.created", session: { id: "s" + state.connections } }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        endpoint: "ws://127.0.0.1:" + port,
        state,
        close: () => { for (const c of state.conns) c.close(); server.close(); },
      });
    });
  });
}

const waitFor = (condFn, timeoutMs = 3000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = () => {
    try { const v = condFn(); if (v) return resolve(v); } catch { /* keep waiting */ }
    if (Date.now() - t0 > timeoutMs) return reject(new Error("waitFor 超时"));
    setTimeout(tick, 25);
  };
  tick();
});

(async () => {
  const { endpoint, state, close } = await startMockRealtimeServer();

  const { port1: client, port2: serverPort } = new MessageChannel();
  client.start();
  const events = [];
  client.on("message", (m) => events.push(m));

  createRelay({
    port: serverPort, apiKey: "test-key", endpoint,
    allowAnyEndpoint: true, // 本地回环测试关闭 allowlist（生产不受影响）
    log: () => {},
  });

  // 1) connect → open + ready（session.created/updated 握手）
  client.postMessage({ kind: "connect", session: {
    input_audio_format: "wav", output_audio_format: "pcm",
    instructions: "BASE-INSTRUCTIONS", voice: "tongtong",
    turn_detection: { type: "server_vad" }, beta_fields: { chat_mode: "audio", tts_source: "e2e" },
  } });
  await waitFor(() => events.some((m) => m.kind === "ready"));
  check("connect 握手产出 open+ready", events.some((m) => m.kind === "open") && events.some((m) => m.kind === "ready"));
  check("session.update 到达服务端（含嵌套 beta_fields）",
    state.sessionUpdates.length === 1 && state.sessionUpdates[0].beta_fields?.chat_mode === "audio"
    && state.sessionUpdates[0].turn_detection?.type === "server_vad");

  // 2) 音频上行：PCM 2048 样本 → 44B WAV 头包裹
  const pcm = Buffer.alloc(4096);
  client.postMessage({ kind: "audio", format: "pcm", sampleRate: 16000, buffer: pcm.buffer.slice(0) }, [pcm.buffer.slice(0)]);
  await waitFor(() => state.appends.length === 1);
  const wav = Buffer.from(state.appends[0], "base64");
  check("音频按 WAV 包帧上行（RIFF/16k/4096B）",
    wav.slice(0, 4).toString() === "RIFF" && wav.readUInt32LE(24) === 16000
    && wav.readUInt32LE(40) === 4096 && wav.length === 4096 + 44,
    "len=" + wav.length);

  // 3) response 下行：文本事件转发 + audioDelta 以可转移 ArrayBuffer 送达
  client.postMessage({ kind: "responseCreate" });
  await waitFor(() => events.some((m) => m.kind === "audioDelta"));
  const ad = events.find((m) => m.kind === "audioDelta");
  check("audio.delta 转为 audioDelta(ArrayBuffer)", ad instanceof Object && ad.buffer instanceof ArrayBuffer && ad.buffer.byteLength === 4800,
    "bytes=" + (ad?.buffer?.byteLength ?? -1));
  const doneEv = events.filter((m) => m.kind === "event" && m.event?.type === "response.done");
  check("response.done 事件转发", doneEv.length >= 1);
  const deltas = events.filter((m) => m.kind === "event" && m.event?.type === "response.audio_transcript.delta");
  check("文本 delta 逐条转发", deltas.length === 2
    && deltas[0].event.delta === "Hello " && deltas[1].event.delta === "there.");

  // 4) cancel 转发
  client.postMessage({ kind: "cancel" });
  await waitFor(() => state.cancels === 1);
  check("response.cancel 转发到服务端", state.cancels === 1);

  // 5) reconnect：新连接 + instructions 内嵌上下文（barge-in 对账通道）
  client.postMessage({ kind: "reconnect", session: { instructions: "BASE-INSTRUCTIONS" },
    contextTranscript: "User: hello\nAssistant: Hello there.", createAfter: false });
  await waitFor(() => events.filter((m) => m.kind === "replayed").length === 1);
  check("reconnect 完成并回 replayed", events.some((m) => m.kind === "replayed"));
  check("reconnect 建立第二条连接", state.connections === 2, "conns=" + state.connections);
  const reSession = state.sessionUpdates[1];
  check("上下文写进新连接 instructions", typeof reSession?.instructions === "string"
    && reSession.instructions.startsWith("BASE-INSTRUCTIONS")
    && reSession.instructions.includes("Conversation so far")
    && reSession.instructions.includes("User: hello")
    && reSession.instructions.includes("Assistant: Hello there."));

  // 6) stop 收尾：relay teardown，端口关闭
  client.postMessage({ kind: "stop" });
  await waitFor(() => state.conns[1].socket.destroyed || state.conns[1].socket.readyState !== "open", 2000).catch(() => {});
  check("stop 后服务端连接被拆除", state.conns[1].socket.readyState !== "open" || state.conns[1].socket.destroyed);

  close();
  console.log(`\nrealtime-relay-e2e: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
