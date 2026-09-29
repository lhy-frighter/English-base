// S14-1A GLM Realtime 协议探针（Electron 主进程，不写生产代码）。
// 阶段：A 连接(Bearer 头) → B session.update(client_vad/pcm) → C 短问 PCM 下行
//       → D MP3 下行对比 → E P0 历史一致性（cancel 后让模型复述）→ F server_vad 分块 RIFF 头测试
const { app, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

app.setPath("userData", path.join(__dirname, "..", "data", "webllm-profile"));

const WS_URL = "wss://open.bigmodel.cn/api/paas/v4/realtime";
const AUDIO_DIR = path.join(__dirname, "audio");
const REPORT = path.join(__dirname, "realtime-probe.json");

function log(...a) { console.log(new Date().toISOString().slice(11, 23), ...a); }

function readKey() {
  const db = new DatabaseSync(path.join(__dirname, "..", "data", "user.sqlite"));
  const row = db.prepare("SELECT v FROM app_settings WHERE k='cloud_key_cipher'").get();
  db.close();
  if (!row || !row.v) throw new Error("no cloud key");
  return safeStorage.decryptString(Buffer.from(row.v, "base64"));
}

// —— WAV 工具 ——
function wavPcmBytes(buf) {
  // 找到 data chunk
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") return { pcm: buf.subarray(off + 8, off + 8 + size), header: buf.subarray(0, off + 8) };
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}
function buildWavHeader(bytes, sr = 16000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + bytes, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(bytes, 40);
  return h;
}

// —— WS 会话封装 ——
function openSession(key, label) {
  const evs = [];
  const waiters = [];
  const t0 = Date.now();
  const ws = new WebSocket(WS_URL, { headers: { Authorization: `Bearer ${key}` } });
  ws.onmessage = (m) => {
    let o = null; try { o = JSON.parse(m.data); } catch { o = { _raw: String(m.data).slice(0, 200) }; }
    const rec = { t: Date.now() - t0, type: o?.type ?? "?", data: o };
    evs.push(rec);
    log(`[${label}] <-`, rec.type);
    if (o?.type === "error") log(`[${label}] ERROR_DETAIL`, JSON.stringify(o.error ?? o.data?.error ?? o).slice(0, 700));
    for (const w of waiters) {
      if (w.pred(rec)) { w.resolve(rec); const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); }
    }
  };
  ws.onerror = (e) => log(`[${label}] WS ERROR`, e.message ?? e?.error ?? "");
  const apiObj = {
    label, evs, t0, ws,
    opened: new Promise((resolve, reject) => {
      ws.onopen = () => { log(`[${label}] opened in ${Date.now() - t0}ms`); resolve(Date.now() - t0); };
      ws.onerror = (e) => reject(new Error("ws_open_failed:" + (e.message ?? "")));
    }),
    send(o) {
      const msg = { event_id: "evt_" + crypto.randomBytes(6).toString("hex"), client_timestamp: Date.now(), ...o };
      ws.send(JSON.stringify(msg));
      log(`[${label}] ->`, msg.type);
    },
    waitFor(pred, timeout = 30000, where = null) {
      const pool = where ?? evs;
      for (const e of pool) if (pred(e)) return Promise.resolve(e);
      return new Promise((resolve, reject) => {
        const w = { pred, resolve };
        waiters.push(w);
        setTimeout(() => {
          const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1);
          reject(new Error("timeout waiting event"));
        }, timeout);
      });
    },
    close() { try { ws.close(); } catch { /* ignore */ } },
  };
  return apiObj;
}

const isType = (t) => (e) => e.type === t;
const includesType = (t) => (e) => String(e.type).includes(t);

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function sessionUpdate(s, { output, vad = "client_vad" }) {
  s.send({
    type: "session.update",
    session: {
      input_audio_format: "wav",
      output_audio_format: output,
      instructions: "You are a friendly English tutor. Keep replies short and natural. Speak English only.",
      turn_detection: { type: vad },
      beta_fields: { chat_mode: "audio", tts_source: "e2e", auto_search: false },
      tools: [],
    },
  });
  const evt = await Promise.race([
    s.waitFor(isType("session.updated"), 15000),
    s.waitFor(isType("error"), 15000),
  ]);
  if (evt.type === "error") {
    throw new Error("session_update_error:" + JSON.stringify(evt.data.error ?? evt.data).slice(0, 300));
  }
  return evt;
}

async function clientVadTurn(s, wavFile, { waitDone = 45000 } = {}) {
  const b64 = fs.readFileSync(wavFile).toString("base64");
  s.send({ type: "input_audio_buffer.append", audio: b64 });
  s.send({ type: "input_audio_buffer.commit" });
  s.send({ type: "response.create" });
  const done = await s.waitFor(isType("response.done"), waitDone);
  return done;
}

function collectOutput(s) {
  const audioDeltas = s.evs.filter(includesType("audio.delta")).filter((e) => !String(e.type).includes("transcript"));
  const transcriptDeltas = s.evs.filter(isType("response.audio_transcript.delta"));
  const transcriptDone = s.evs.filter(isType("response.audio_transcript.done"));
  const audioB64 = audioDeltas.map((e) => e.data.delta ?? "").join("");
  const transcript = transcriptDone.length
    ? (transcriptDone[transcriptDone.length - 1].data.transcript ?? "")
    : transcriptDeltas.map((e) => e.data.delta ?? "").join("");
  return { audioB64, transcript, audioChunks: audioDeltas.length };
}

// —— 主流程 ——
app.whenReady().then(async () => {
  const report = { startedAt: new Date().toISOString(), phases: {} };
  const save = () => fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  try {
    const key = readKey();
    log("key decrypted, length", key.length);

    // —— 阶段 C：client_vad + PCM 下行 ——
    {
      const s = openSession(key, "C-pcm");
      const connectMs = await s.opened;
      await s.waitFor(includesType("session.created"), 10000).catch(() => null);
      await sessionUpdate(s, { output: "pcm" });
      const tCreate = Date.now();
      await clientVadTurn(s, path.join(AUDIO_DIR, "p1-short.wav"), { waitDone: 60000 });
      const out = collectOutput(s);
      const firstDelta = s.evs.find(includesType("audio.delta"));
      const pcmPath = path.join(AUDIO_DIR, "out-pcm.pcm");
      fs.writeFileSync(pcmPath, Buffer.from(out.audioB64, "base64"));
      report.phases.C_pcm = {
        connectMs,
        firstAudioMs: firstDelta ? firstDelta.t - (s.evs.find(isType("response.create"))?.t ?? 0) : null,
        audioChunks: out.audioChunks, pcmBytes: Buffer.from(out.audioB64, "base64").length,
        transcript: out.transcript,
      };
      log("C transcript:", out.transcript.slice(0, 160));
      s.close(); save();
      await sleep(1500);
    }

    // —— 阶段 D：client_vad + MP3 下行 ——
    {
      const s = openSession(key, "D-mp3");
      const connectMs = await s.opened;
      await s.waitFor(includesType("session.created"), 10000).catch(() => null);
      await sessionUpdate(s, { output: "mp3" });
      await clientVadTurn(s, path.join(AUDIO_DIR, "p4-greeting.wav"), { waitDone: 60000 });
      const out = collectOutput(s);
      const mp3Path = path.join(AUDIO_DIR, "out-mp3.mp3");
      fs.writeFileSync(mp3Path, Buffer.from(out.audioB64, "base64"));
      const firstDelta = s.evs.find(includesType("audio.delta"));
      report.phases.D_mp3 = {
        connectMs,
        firstAudioMs: firstDelta ? firstDelta.t - (s.evs.find(isType("response.create"))?.t ?? 0) : null,
        audioChunks: out.audioChunks, mp3Bytes: Buffer.from(out.audioB64, "base64").length,
        transcript: out.transcript,
      };
      log("D transcript:", out.transcript.slice(0, 160));
      s.close(); save();
      await sleep(1500);
    }

    // —— 阶段 E：P0 历史一致性 ——
    {
      const s = openSession(key, "E-history");
      await s.opened;
      await s.waitFor(includesType("session.created"), 10000).catch(() => null);
      await sessionUpdate(s, { output: "mp3" });

      // 长回答
      const b64 = fs.readFileSync(path.join(AUDIO_DIR, "p2-long.wav")).toString("base64");
      s.send({ type: "input_audio_buffer.append", audio: b64 });
      s.send({ type: "input_audio_buffer.commit" });
      s.send({ type: "response.create" });
      const tRespCreate = Date.now();

      // 等到 transcript 累计 ≥180 字符（或首 delta 后 8s）
      let prefix = "";
      const waitUntil = Date.now() + 40000;
      while (Date.now() < waitUntil) {
        await sleep(500);
        prefix = s.evs.filter(isType("response.audio_transcript.delta")).map((e) => e.data.delta ?? "").join("");
        const firstD = s.evs.find(includesType("audio.delta"));
        if (prefix.length >= 180 && firstD && Date.now() - tRespCreate > 6000) break;
      }
      const audioBeforeCancel = s.evs.filter(includesType("audio.delta")).filter((e) => !String(e.type).includes("transcript")).length;
      log("E cancel after", audioBeforeCancel, "audio deltas, prefix len", prefix.length);

      s.send({ type: "response.cancel" });
      const tCancel = Date.now();
      // 等旧响应收敛
      await s.waitFor(isType("response.done"), 20000).catch(() => null);
      const cancelDone = s.evs.filter(isType("response.done"));
      const cancelStatus = cancelDone.length ? cancelDone[cancelDone.length - 1].data?.response?.status : null;
      await sleep(1500);

      // 新一轮：要求逐字复述
      const b64r = fs.readFileSync(path.join(AUDIO_DIR, "p3-repeat.wav")).toString("base64");
      const evsMark = s.evs.length;
      s.send({ type: "input_audio_buffer.append", audio: b64r });
      s.send({ type: "input_audio_buffer.commit" });
      s.send({ type: "response.create" });
      await s.waitFor(isType("response.done"), 60000);
      const newEvs = s.evs.slice(evsMark);
      const repeatTranscript = newEvs.filter(isType("response.audio_transcript.done"))
        .map((e) => e.data.transcript ?? "").join("")
        || newEvs.filter(isType("response.audio_transcript.delta")).map((e) => e.data.delta ?? "").join("");

      // 关键词重叠分析（取 prefix 中长度≥5 的词）
      const stop = new Set(["about", "which", "their", "there", "engine", "would", "which", "process", "inside"]);
      const prefixWords = [...prefix.toLowerCase().matchAll(/[a-z]{5,}/g)].map((m) => m[0]);
      const freq = {};
      for (const w of prefixWords) freq[w] = (freq[w] ?? 0) + 1;
      const distinctive = Object.entries(freq).filter(([, n]) => n >= 1).map(([w]) => w).slice(0, 24);
      const rt = repeatTranscript.toLowerCase();
      const overlaps = distinctive.filter((w) => rt.includes(w));

      report.phases.E_history = {
        canceledPrefix: prefix,
        canceledAudioDeltas: audioBeforeCancel,
        cancelStatus,
        cancelToDoneMs: (s.evs.find((e) => e.type === "response.done" && e.t >= (Date.now() - s.t0 - 30000))?.t) ?? null,
        repeatTranscript,
        distinctiveWords: distinctive,
        overlapWords: overlaps,
        overlapRatio: distinctive.length ? overlaps.length / distinctive.length : null,
        verdict: overlaps.length >= Math.ceil(distinctive.length * 0.5)
          ? "SERVER_RETAINED_CANCELED_CONTENT"
          : overlaps.length === 0 ? "CANCELED_CONTENT_NOT_IN_HISTORY" : "PARTIAL_REVIEW",
      };
      log("E verdict:", report.phases.E_history.verdict,
        "overlap", `${overlaps.length}/${distinctive.length}`);
      s.close(); save();
      await sleep(1500);
    }

    // —— 阶段 F：server_vad 分块 RIFF 头测试 ——
    // F1：每块带独立 RIFF 头；F2：首块 RIFF + 后续裸 PCM
    for (const [variant, mode] of [["F1_riff_each", "riff"], ["F2_header_once", "raw"]]) {
      const s = openSession(key, variant);
      await s.opened;
      await s.waitFor(includesType("session.created"), 10000).catch(() => null);
      await sessionUpdate(s, { output: "mp3", vad: "server_vad" });
      const { pcm } = wavPcmBytes(fs.readFileSync(path.join(AUDIO_DIR, "p1-short.wav")));
      const blockBytes = 3200 * 2; // 200ms
      const tStart = Date.now();
      for (let off = 0; off < pcm.length; off += blockBytes) {
        const block = pcm.subarray(off, Math.min(off + blockBytes, pcm.length));
        if (mode === "riff") {
          const h = buildWavHeader(block.length, 16000);
          s.send({ type: "input_audio_buffer.append", audio: Buffer.concat([h, block]).toString("base64") });
        } else {
          if (off === 0) {
            const h = buildWavHeader(block.length, 16000);
            s.send({ type: "input_audio_buffer.append", audio: Buffer.concat([h, block]).toString("base64") });
          } else {
            s.send({ type: "input_audio_buffer.append", audio: block.toString("base64") });
          }
        }
        await sleep(180); // 模拟实时
      }
      log(variant, "streamed in", Date.now() - tStart, "ms; waiting server vad response");
      // server vad 自动提交并响应
      const result = await s.waitFor(isType("response.done"), 60000).catch(() => null);
      const out = collectOutput(s);
      const speechStartEv = s.evs.filter(isType("input_audio_buffer.speech_started")).length;
      const committedEv = s.evs.filter(isType("input_audio_buffer.committed")).length;
      report.phases[variant] = {
        speechStartedEvents: speechStartEv, committedEvents: committedEv,
        gotResponse: !!result, transcript: out.transcript, audioChunks: out.audioChunks,
      };
      log(variant, "transcript:", out.transcript.slice(0, 160));
      s.close(); save();
      await sleep(2000);
    }

    report.finishedAt = new Date().toISOString();
    save();
    log("PROBE DONE");
  } catch (e) {
    report.error = String(e?.stack || e);
    save();
    log("PROBE ERROR", report.error);
  } finally {
    app.quit();
  }
});
