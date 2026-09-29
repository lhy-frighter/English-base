const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/tts.ts";
let s = fs.readFileSync(p, "utf8");

const impOld = `import { splitSentences, planKokoroChunks } from "./tts-chunks";`;
const impNew = `import { splitSentences, planKokoroChunks, drainSentences } from "./tts-chunks";`;
if (!s.includes(impOld)) throw new Error("tts import anchor missing");
s = s.replace(impOld, impNew);

const add = `
// —— 流式播放器（V8-3 对话）：LLM 边生成、句子边入播放队列；维护已播字符游标 ——
export interface StreamingSpeaker {
  feed(cumulativeText: string): void;
  end(): Promise<void>;
  stop(): number; // 打断：立即静音，返回已播字符位置
  get playedCharEnd(): number;
}
export interface StreamingSpeakerOpts {
  enabled: boolean; // 用户关闭出声时不加载任何 TTS，游标随全文推进
  onFirstAudio?: () => void;
  onPhase?: (phase: "loading" | "speaking" | "idle") => void;
}

export function startStreamingSpeaker(opts: StreamingSpeakerOpts): StreamingSpeaker {
  let buffer = "";
  let playedEnd = 0;
  let backend: "kokoro" | "sapi" | null = null;
  let chain: Promise<void> = Promise.resolve();
  let pumping = false;
  const my = ++gen;
  let firstAudioFired = false;
  const queue: { sentence: string; endOffset: number }[] = [];
  const sKeep = ttsAvailable()
    ? setInterval(() => { if (my === gen) { try { speechSynthesis.resume(); } catch { /* noop */ } } }, 4000)
    : null;

  // Kokoro 播放状态
  let sActx: AudioContext | null = null;
  let sSources: AudioBufferSourceNode[] = [];
  let nextStart = 0;

  const fireFirst = () => { if (!firstAudioFired) { firstAudioFired = true; opts.onFirstAudio?.(); } };

  const ensureBackend = async (): Promise<"kokoro" | "sapi" | null> => {
    if (backend !== null) return backend;
    if (!opts.enabled) return null;
    try {
      if (await kokoroInstalled()) {
        opts.onPhase?.("loading");
        await inference.acquire("tts"); // init + 热身
        if (my !== gen) throw new Error("cancelled");
        scheduleIdleRelease();
        backend = "kokoro";
      } else {
        throw new Error("kokoro not installed");
      }
    } catch (e) {
      if (my !== gen) throw e as Error;
      if (ttsAvailable()) backend = "sapi";
    }
    return backend;
  };

  const waitSentenceAudible = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      const last = sSources[sSources.length - 1];
      if (!last) return resolve();
      const tick = setInterval(() => { if (my !== gen) { clearInterval(tick); resolve(); } }, 200);
      last.onended = () => { clearInterval(tick); sSources = sSources.filter((x) => x !== last); resolve(); };
    });
  };

  const playKokoroSentence = async (sentence: string, endOffset: number): Promise<void> => {
    const chunks = planKokoroChunks(sentence);
    for (const c of chunks) {
      if (my !== gen) return;
      const got = await kokoroTts.synthChunk(c.text, c.pause, !!c.seamless);
      if (my !== gen) return;
      if (!sActx) sActx = new AudioContext({ sampleRate: kokoroTts.sampleRate });
      if (sActx.state === "suspended") await sActx.resume();
      const ab = sActx.createBuffer(1, got.pcm.length, got.sampleRate);
      ab.getChannelData(0).set(got.pcm);
      const src = sActx.createBufferSource();
      src.buffer = ab; src.connect(sActx.destination);
      if (!nextStart) nextStart = sActx.currentTime + 0.08;
      const t = Math.max(nextStart, sActx.currentTime + 0.02);
      src.start(t); nextStart = t + ab.duration;
      sSources.push(src);
      src.onended = () => { sSources = sSources.filter((x) => x !== src); };
      fireFirst();
    }
    await waitSentenceAudible();
    if (my === gen) playedEnd = endOffset;
  };

  const playSapiSentence = (sentence: string, endOffset: number): Promise<void> => new Promise((resolve) => {
    const clauses = splitSentences(sentence);
    let i = 0;
    const step = () => {
      if (my !== gen) return resolve();
      if (i >= clauses.length) { playedEnd = endOffset; return resolve(); }
      const c = clauses[i++];
      const u = new SpeechSynthesisUtterance(c.text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
      u.rate = 0.95;
      u.onstart = () => fireFirst();
      u.onend = () => { if (my !== gen) return resolve(); if (c.pause > 0 && i < clauses.length) setTimeout(step, c.pause); else step(); };
      u.onerror = () => step();
      speechSynthesis.speak(u);
    };
    step();
  });

  const pump = async (): Promise<void> => {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length && my === gen) {
        const item = queue.shift()!;
        opts.onPhase?.("speaking");
        if (backend === "kokoro") await playKokoroSentence(item.sentence, item.endOffset);
        else if (backend === "sapi") await playSapiSentence(item.sentence, item.endOffset);
        else playedEnd = Math.max(playedEnd, item.endOffset);
      }
    } finally {
      pumping = false;
    }
  };

  const process = async (cumulative: string, isFinal: boolean): Promise<void> => {
    buffer = cumulative;
    if (!opts.enabled) { playedEnd = buffer.length; return; }
    const { ready, rest } = drainSentences(buffer);
    let searchFrom = 0;
    const starts = ready.map((sentence) => {
      const idx = buffer.indexOf(sentence, searchFrom);
      searchFrom = idx + sentence.length;
      return idx;
    });
    ready.forEach((sentence, i) => {
      const endOffset = i < ready.length - 1 ? starts[i + 1] : buffer.length - rest.length;
      queue.push({ sentence, endOffset });
    });
    if (isFinal && rest.trim()) queue.push({ sentence: rest.trim(), endOffset: buffer.length });
    if (!queue.length) return;
    const b = await ensureBackend();
    if (b) await pump();
    else while (queue.length) playedEnd = Math.max(playedEnd, queue.shift()!.endOffset);
  };

  return {
    feed(cumulativeText: string) {
      chain = chain.then(() => process(cumulativeText, false)).catch(() => undefined);
    },
    async end() {
      await (chain = chain.then(() => process(buffer, true)).catch(() => undefined));
      if (sKeep) clearInterval(sKeep);
      opts.onPhase?.("idle");
    },
    stop() {
      for (const src of sSources) { try { src.onended = null; src.stop(); } catch { /* noop */ } }
      sSources = [];
      if (ttsAvailable()) { try { speechSynthesis.cancel(); } catch { /* noop */ } }
      if (sKeep) clearInterval(sKeep);
      opts.onPhase?.("idle");
      return playedEnd;
    },
    get playedCharEnd() { return playedEnd; },
  };
}
`;

s = s + add;
fs.writeFileSync(p, s);
console.log("streaming speaker added to tts.ts");
