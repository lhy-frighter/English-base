// S14-1A 补探3：E2（独特内容故事 P0 复测）+ F4（server_vad 持续流+尾部静音）。
const { app, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

app.setPath("userData", path.join(__dirname, "..", "data", "webllm-profile"));

const WS_URL = "wss://open.bigmodel.cn/api/paas/v4/realtime";
const AUDIO_DIR = path.join(__dirname, "audio");
const REPORT3 = path.join(__dirname, "realtime-probe-3.json");

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

function transcriptOf(evs) {
  const done = evs.filter(isType("response.audio_transcript.done"));
  if (done.length) return done.map((e) => e.data.transcript ?? "").join("");
  return evs.filter(isType("response.audio_transcript.delta")).map((e) => e.data.delta ?? "").join("");
}

const STOPWORDS = new Set(("about,after,again,being,could,every,first,found,great,house,inside,large,learn,little,lives,loved,made,make,makes,many,maybe,might,music,never,night,often,other,ought,place,really,right,said,says,seemed,seems,shall,should,since,small,something,sometimes,soon,still,story,taken,tells,their,them,then,there,these,thing,think,those,though,thought,through,under,until,using,wanted,wants,where,which,while,white,whole,words,world,would,young,yourself,story,store,small,opened,open,named,along,began,behind,between,before,because,become,becomes,became,around,always,almost,already,although,among,another,answer,anything,anyway,asked,asking,began,begin,behind,being,below,beside,better,between,beyond,brought,call,called,came,carry,certain,close,comes,coming,could,day,days,did,does,doing,done,down,during,each,enough,even,ever,every,eyes,face,far,feel,felt,few,find,found,from,front,get,gets,getting,give,given,gives,go,goes,going,gone,got,had,has,have,having,he,her,here,hers,herself,him,himself,his,how,however,into,its,itself,just,keep,kept,know,knows,knew,known,last,later,lay,left,let,lets,life,like,long,look,looking,looks,made,make,man,may,me,mean,means,might,mind,moment,more,most,mother,much,must,my,myself,name,near,need,needs,never,new,next,night,no,nobody,not,now,number,of,off,oh,ok,old,on,once,one,only,onto,or,our,ours,out,over,own,part,people,perhaps,put,ran,rather,really,right,room,round,run,same,saw,say,saying,see,seeing,seen,sees,seemed,shall,she,should,showed,since,sir,sit,sitting,soon,sound,still,such,sure,take,taken,takes,tell,telling,than,that,the,their,theirs,them,themselves,then,there,these,they,thing,things,this,those,though,thought,three,through,thus,time,to,today,together,too,took,toward,turn,turned,under,until,up,upon,us,use,used,uses,using,very,want,wanted,was,way,we,well,went,were,what,when,where,whether,which,while,who,whole,whom,whose,why,will,with,within,without,woman,word,words,work,worked,working,works,would,year,years,yet,you,your,yours,yourself,yourselves").split(","));

function ngramShared(a, b, n) {
  const toks = (t) => t.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  const ta = toks(a), tb = toks(b);
  const setB = new Set();
  for (let i = 0; i + n <= tb.length; i++) setB.add(tb.slice(i, i + n).join(" "));
  let shared = 0;
  const seen = new Set();
  for (let i = 0; i + n <= ta.length; i++) {
    const g = ta.slice(i, i + n).join(" ");
    if (setB.has(g) && !seen.has(g)) { shared++; seen.add(g); }
  }
  return { shared, totalA: Math.max(0, ta.length - n + 1) };
}

app.whenReady().then(async () => {
  const report = { startedAt: new Date().toISOString(), phases: {} };
  const save = () => fs.writeFileSync(REPORT3, JSON.stringify(report, null, 2));
  try {
    const key = readKey();
    log("key decrypted, length", key.length);

    // —— E2：独特内容故事 P0 复测 ——
    {
      const s = openSession(key, "E2-story");
      await s.opened;
      await s.waitFor(includesType("session.created"), 10000).catch(() => null);
      await sessionUpdate(s, { output: "mp3" });

      const b64 = fs.readFileSync(path.join(AUDIO_DIR, "p5-story.wav")).toString("base64");
      s.send({ type: "input_audio_buffer.append", audio: b64 });
      s.send({ type: "input_audio_buffer.commit" });
      s.send({ type: "response.create" });
      const tRespCreate = Date.now();

      let prefix = "";
      const waitUntil = Date.now() + 60000;
      while (Date.now() < waitUntil) {
        await sleep(500);
        prefix = transcriptOf(s.evs);
        const audioN = s.evs.filter((e) => includesType("audio.delta")(e) && !String(e.type).includes("transcript")).length;
        if (audioN >= 4 && prefix.length >= 500 && Date.now() - tRespCreate > 8000) break;
      }
      const audioBeforeCancel = s.evs.filter((e) => includesType("audio.delta")(e) && !String(e.type).includes("transcript")).length;
      log("E2 cancel after", audioBeforeCancel, "audio deltas, prefix len", prefix.length);

      const cancelT = Date.now() - s.t0;
      s.send({ type: "response.cancel" });
      const cancelDoneEvt = await s.waitFor(isType("response.done"), 20000).catch(() => null);
      const cancelStatus = cancelDoneEvt?.data?.response?.status ?? null;
      const cancelToDoneMs = cancelDoneEvt ? cancelDoneEvt.t - cancelT : null;
      await sleep(1500);

      const b64r = fs.readFileSync(path.join(AUDIO_DIR, "p3-repeat.wav")).toString("base64");
      const repeatMark = Date.now() - s.t0;
      s.send({ type: "input_audio_buffer.append", audio: b64r });
      s.send({ type: "input_audio_buffer.commit" });
      s.send({ type: "response.create" });
      await s.waitFor((e) => e.type === "response.done" && e.t >= repeatMark, 60000);
      const repeatTranscript = transcriptOf(s.evs.filter((e) => e.t >= repeatMark));
      log("E2 repeat transcript len:", repeatTranscript.length);

      // 独特词：前缀中长度≥5 的低频实词（去停用词、去问题词）
      const questionText = "Tell me a short original story about a penguin named Balthazar who runs a jazz bookstore in Kyoto. Make it at least three hundred words with specific details.";
      const qWords = new Set(questionText.toLowerCase().match(/[a-z]+/g));
      // 前缀中的专有名词（大写、非句首）
      const capNames = [...prefix.matchAll(/(?:[.!?]\s+|^)?([A-Z][a-z]{3,})/g)].map((m) => m[1].toLowerCase());
      const pWords = [...prefix.toLowerCase().matchAll(/[a-z]{5,}/g)].map((m) => m[0]);
      const distinctiveSet = new Set();
      for (const w of [...pWords, ...capNames]) {
        if (STOPWORDS.has(w) || qWords.has(w)) continue;
        distinctiveSet.add(w);
      }
      const distinctive = [...distinctiveSet].slice(0, 40);
      const rt = repeatTranscript.toLowerCase();
      const overlaps = distinctive.filter((w) => rt.includes(w));
      const ng4 = ngramShared(prefix, repeatTranscript, 4);
      const ng5 = ngramShared(prefix, repeatTranscript, 5);

      report.phases.E2_story = {
        canceledPrefix: prefix,
        canceledAudioDeltas: audioBeforeCancel,
        cancelStatus,
        cancelToDoneMs,
        repeatTranscript,
        distinctiveWords: distinctive,
        overlapWords: overlaps,
        overlapRatio: distinctive.length ? overlaps.length / distinctive.length : null,
        shared4gram: ng4,
        shared5gram: ng5,
      };
      log("E2 overlap", `${overlaps.length}/${distinctive.length}`, "shared 4g", ng4.shared, "5g", ng5.shared);
      s.close(); save();
      await sleep(1500);
    }

    // —— F4：server_vad 持续流（2048 样本完整 WAV）+ 尾部 3s 静音 ——
    {
      const variant = "F4_server_vad_trailing_silence";
      const s = openSession(key, variant);
      await s.opened;
      await s.waitFor(includesType("session.created"), 10000).catch(() => null);
      await sessionUpdate(s, { output: "mp3", vad: "server_vad" });
      const { pcm } = wavPcmBytes(fs.readFileSync(path.join(AUDIO_DIR, "p1-short.wav")));
      const FRAME = 2048 * 2; // 2048 samples = 128ms
      const mark = Date.now() - s.t0;
      const tStart = Date.now();
      const sendFrame = async (frame) => {
        const h = buildWavHeader(frame.length, 16000);
        s.send({ type: "input_audio_buffer.append", audio: Buffer.concat([h, frame]).toString("base64") });
        await sleep(128);
      };
      for (let off = 0; off < pcm.length; off += FRAME) {
        await sendFrame(pcm.subarray(off, Math.min(off + FRAME, pcm.length)));
      }
      // 尾部静音：24 帧 ≈ 3.07s
      for (let i = 0; i < 24; i++) await sendFrame(Buffer.alloc(FRAME));
      log(variant, "streamed in", Date.now() - tStart, "ms");

      const committed = await s.waitFor((e) => e.type === "input_audio_buffer.committed" && e.t >= mark, 20000).catch(() => null);
      const result = await s.waitFor((e) => e.type === "response.done" && e.t >= mark, 60000).catch(() => null);

      const later = s.evs.filter((e) => e.t >= mark);
      const audioDeltas = later.filter(isType("response.audio.delta"));
      const transcript = transcriptOf(later);
      const audioB64 = audioDeltas.map((e) => e.data.delta ?? "").join("");
      if (audioB64) fs.writeFileSync(path.join(AUDIO_DIR, "out-f4.mp3"), Buffer.from(audioB64, "base64"));

      report.phases[variant] = {
        speechStartedEvents: later.filter(isType("input_audio_buffer.speech_started")).length,
        speechStoppedEvents: later.filter(isType("input_audio_buffer.speech_stopped")).length,
        committedEvents: later.filter(isType("input_audio_buffer.committed")).length,
        gotCommitted: !!committed,
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
    log("PROBE3 DONE");
  } catch (e) {
    report.error = String(e?.stack || e);
    save();
    log("PROBE3 ERROR", report.error);
  } finally {
    app.quit();
  }
});
