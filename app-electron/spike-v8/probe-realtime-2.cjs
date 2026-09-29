// S14-1A 补探：E（修正等待口径，真收复述轮）+ F3（server_vad 官方姿势）。
const { app, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

app.setPath("userData", path.join(__dirname, "..", "data", "webllm-profile"));

const WS_URL = "wss://open.bigmodel.cn/api/paas/v4/realtime";
const AUDIO_DIR = path.join(__dirname, "audio");
const REPORT2 = path.join(__dirname, "realtime-probe-2.json");

function log(...a) { console.log(new Date().toISOString().slice(11, 23), ...a); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function readKey() {
  const db = new DatabaseSync(path.join(__dirname, "..", "data", "user.sqlite"));
  const row = db.prepare("SELECT v FROM app_settings WHERE k='cloud_key_cipher'").get();
  db.close();
  if (!row || !row.v) throw new Error("no cloud key");
  return safeStorage.decryptString(Buffer.from(row.v, "base64"));
}

function wavPcmBytes(buf) {
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
    waitFor(pred, timeout = 30000) {
      for (const e of evs) if (pred(e)) return Promise.resolve(e);
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

async function sessionUpdate(s, { output, vad = "client_vad" }) {
  s.send({
    type: "session.update",
    // beta_fields 在 SDK 中被拍平到 session 顶层
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

app.whenReady().then(async () => {
  const report = { startedAt: new Date().toISOString(), phases: {} };
  const save = () => fs.writeFileSync(REPORT2, JSON.stringify(report, null, 2));
  try {
    const key = readKey();
    log("key decrypted, length", key.length);

    // —— E：P0 历史一致性（修正等待口径）——
    {
      const s = openSession(key, "E-history2");
      await s.opened;
      await s.waitFor(includesType("session.created"), 10000).catch(() => null);
      await sessionUpdate(s, { output: "mp3" });

      const b64 = fs.readFileSync(path.join(AUDIO_DIR, "p2-long.wav")).toString("base64");
      s.send({ type: "input_audio_buffer.append", audio: b64 });
      s.send({ type: "input_audio_buffer.commit" });
      s.send({ type: "response.create" });
      const tRespCreate = Date.now();

      let prefix = "";
      const waitUntil = Date.now() + 40000;
      while (Date.now() < waitUntil) {
        await sleep(500);
        prefix = s.evs.filter(isType("response.audio_transcript.delta")).map((e) => e.data.delta ?? "").join("");
        const firstD = s.evs.find((e) => includesType("audio.delta")(e) && !String(e.type).includes("transcript"));
        if (prefix.length >= 180 && firstD && Date.now() - tRespCreate > 6000) break;
      }
      const audioBeforeCancel = s.evs.filter((e) => includesType("audio.delta")(e) && !String(e.type).includes("transcript")).length;
      log("E cancel after", audioBeforeCancel, "audio deltas, prefix len", prefix.length);

      const cancelT = Date.now() - s.t0;
      s.send({ type: "response.cancel" });
      const cancelDoneEvt = await s.waitFor(isType("response.done"), 20000).catch(() => null);
      const cancelStatus = cancelDoneEvt?.data?.response?.status ?? null;
      const cancelToDoneMs = cancelDoneEvt ? cancelDoneEvt.t - cancelT : null;
      await sleep(1500);

      // 新一轮：逐字复述 —— 用时间游标，绝不匹配旧事件
      const b64r = fs.readFileSync(path.join(AUDIO_DIR, "p3-repeat.wav")).toString("base64");
      const repeatMark = Date.now() - s.t0;
      s.send({ type: "input_audio_buffer.append", audio: b64r });
      s.send({ type: "input_audio_buffer.commit" });
      s.send({ type: "response.create" });
      await s.waitFor((e) => e.type === "response.done" && e.t >= repeatMark, 60000);
      const newEvs = s.evs.filter((e) => e.t >= repeatMark);
      const repeatTranscript = newEvs.filter(isType("response.audio_transcript.done"))
        .map((e) => e.data.transcript ?? "").join("")
        || newEvs.filter(isType("response.audio_transcript.delta")).map((e) => e.data.delta ?? "").join("");
      log("E repeat transcript len:", repeatTranscript.length);

      const prefixWords = [...prefix.toLowerCase().matchAll(/[a-z]{5,}/g)].map((m) => m[0]);
      const freq = {};
      for (const w of prefixWords) freq[w] = (freq[w] ?? 0) + 1;
      const distinctive = Object.entries(freq).map(([w]) => w).slice(0, 24);
      const rt = repeatTranscript.toLowerCase();
      const overlaps = distinctive.filter((w) => rt.includes(w));

      report.phases.E_history = {
        canceledPrefix: prefix,
        canceledAudioDeltas: audioBeforeCancel,
        cancelStatus,
        cancelToDoneMs,
        repeatTranscript,
        distinctiveWords: distinctive,
        overlapWords: overlaps,
        overlapRatio: distinctive.length ? overlaps.length / distinctive.length : null,
        verdict: overlaps.length >= Math.ceil(distinctive.length * 0.5)
          ? "SERVER_RETAINED_CANCELED_CONTENT"
          : overlaps.length === 0 ? "CANCELED_CONTENT_NOT_IN_HISTORY" : "PARTIAL_REVIEW",
      };
      log("E verdict:", report.phases.E_history.verdict, "overlap", `${overlaps.length}/${distinctive.length}`);
      s.close(); save();
      await sleep(1500);
    }

    // —— F3：server_vad 官方姿势（100ms 完整 WAV、100ms 节拍、拍平 beta）——
    {
      const variant = "F3_server_vad_official";
      const s = openSession(key, variant);
      await s.opened;
      await s.waitFor(includesType("session.created"), 10000).catch(() => null);
      await sessionUpdate(s, { output: "mp3", vad: "server_vad" });
      const { pcm } = wavPcmBytes(fs.readFileSync(path.join(AUDIO_DIR, "p1-short.wav")));
      const blockBytes = 1600 * 2; // 100ms
      const tStart = Date.now();
      for (let off = 0; off < pcm.length; off += blockBytes) {
        const block = pcm.subarray(off, Math.min(off + blockBytes, pcm.length));
        const h = buildWavHeader(block.length, 16000);
        s.send({ type: "input_audio_buffer.append", audio: Buffer.concat([h, block]).toString("base64") });
        await sleep(100);
      }
      log(variant, "streamed in", Date.now() - tStart, "ms; waiting server vad response");
      const mark = Date.now() - s.t0;
      const result = await s.waitFor((e) => e.type === "response.done" && e.t >= mark, 60000).catch(() => null);

      const later = s.evs.filter((e) => e.t >= mark - 50);
      const audioDeltas = later.filter(isType("response.audio.delta"));
      const transcriptDone = later.filter(isType("response.audio_transcript.done"));
      const transcriptDeltas = later.filter(isType("response.audio_transcript.delta"));
      const transcript = transcriptDone.length
        ? transcriptDone[transcriptDone.length - 1].data.transcript ?? ""
        : transcriptDeltas.map((e) => e.data.delta ?? "").join("");
      const audioB64 = audioDeltas.map((e) => e.data.delta ?? "").join("");
      if (audioB64) fs.writeFileSync(path.join(AUDIO_DIR, "out-f3.mp3"), Buffer.from(audioB64, "base64"));

      report.phases[variant] = {
        speechStartedEvents: later.filter(isType("input_audio_buffer.speech_started")).length,
        speechStoppedEvents: later.filter(isType("input_audio_buffer.speech_stopped")).length,
        committedEvents: later.filter(isType("input_audio_buffer.committed")).length,
        gotResponse: !!result,
        transcript,
        audioChunks: audioDeltas.length,
        mp3Bytes: Buffer.from(audioB64, "base64").length,
      };
      log(variant, "transcript:", transcript.slice(0, 200));
      s.close(); save();
    }

    report.finishedAt = new Date().toISOString();
    save();
    log("PROBE2 DONE");
  } catch (e) {
    report.error = String(e?.stack || e);
    save();
    log("PROBE2 ERROR", report.error);
  } finally {
    app.quit();
  }
});
