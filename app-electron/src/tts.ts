// 朗读统一入口（ADR-5）：优先 Kokoro 本地神经 TTS（pauses 意群流式合成 + 排队播放），
// 模型未安装/下载失败/低端机不可用时自动降级 Web Speech（Windows SAPI，零下载）。
// v2.9.1：SAPI 用句子级切分 splitSentences（逗号不切段，保留句调）；
// Kokoro 用意群级 planKokoroChunks（splitClauses + 首块 ≤6 词，A/B 耳朵裁决选 pauses）。
import { splitSentences, planKokoroChunks, planStreamQueue } from "./tts-chunks";
import { inference } from "./inference/coordinator";
import { kokoroTts } from "./tts-kokoro/kokoro";

// —— 状态订阅（供 UI 显示"神经语音加载/播放中"，首次 init+热身约数秒）——
export type TtsEngine = "kokoro" | "sapi";
export interface TtsStatus { phase: "idle" | "loading" | "speaking" | "error"; engine: TtsEngine | null; message?: string }
type Listener = (s: TtsStatus) => void;
const listeners = new Set<Listener>();
let status: TtsStatus = { phase: "idle", engine: null };
function emit(patch: Partial<TtsStatus> & { phase: TtsStatus["phase"] }) {
  status = { ...status, ...patch };
  for (const l of listeners) { try { l(status); } catch { /* noop */ } }
}
export function onTtsStatus(l: Listener): () => void { listeners.add(l); try { l(status); } catch { /* noop */ } return () => listeners.delete(l); }

// —— SAPI（兜底路径）——
let cachedVoice: SpeechSynthesisVoice | null = null;
let gen = 0; // 朗读代号：新一次 speak/stop 让旧队列（两条引擎路径）全部失效
let keepAlive: ReturnType<typeof setInterval> | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  if (cachedVoice) return cachedVoice;
  const voices = speechSynthesis.getVoices();
  cachedVoice =
    voices.find((v) => /en[-_]US/i.test(v.lang) && /local|natural|zira|david|aria|jenny/i.test(v.name + v.voiceURI)) ||
    voices.find((v) => /en[-_]US/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null;
  return cachedVoice;
}

// 部分 Chromium 语音列表异步就绪
export function warmTts() {
  if (typeof speechSynthesis === "undefined") return;
  const load = () => { cachedVoice = null; pickVoice(); };
  if (typeof speechSynthesis.onvoiceschanged !== "undefined") speechSynthesis.onvoiceschanged = load;
  load();
}

export function ttsAvailable(): boolean {
  return typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
}

function clearKeepAlive() {
  if (keepAlive !== null) { clearInterval(keepAlive); keepAlive = null; }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 句与句之间在模型自然尾音之外再补的很短间隙（句内停顿完全交给模型，不人工插入）
const SENTENCE_GAP_MS = 170;

// —— Kokoro 播放层 ——
let actx: AudioContext | null = null;
let activeSources: AudioBufferSourceNode[] = [];
let idleReleaseTimer: ReturnType<typeof setTimeout> | null = null;
let installedCache: { v: boolean; at: number } | null = null;
const INSTALL_CACHE_MS = 60_000;

async function kokoroInstalled(): Promise<boolean> {
  if (installedCache && Date.now() - installedCache.at < INSTALL_CACHE_MS) return installedCache.v;
  const v = await kokoroTts.isInstalled();
  installedCache = { v, at: Date.now() };
  return v;
}

// 页面可在挂载时预热（如跟读台）：已安装才动作，未安装静默跳过，不触发下载
export async function prewarmKokoro() {
  try {
    if (!(await kokoroInstalled())) return;
    await inference.acquire("tts");
    scheduleIdleRelease();
  } catch { /* 预热失败不打扰，播放时再降级 */ }
}

function scheduleIdleRelease() {
  if (idleReleaseTimer) clearTimeout(idleReleaseTimer);
  idleReleaseTimer = setTimeout(() => { inference.release("tts").catch(() => {}); }, 120_000);
}

function stopKokoroPlayback() {
  for (const s of activeSources) { try { s.onended = null; s.stop(); } catch { /* noop */ } }
  activeSources = [];
}

async function kokoroSpeak(text: string, my: number): Promise<void> {
  emit({ phase: "loading", engine: "kokoro", message: "神经语音加载中（首次约数秒）" });
  await inference.acquire("tts"); // 含 Worker init + 热身；未安装/失败会抛错
  if (my !== gen) return;
  scheduleIdleRelease();
  const chunks = planKokoroChunks(text);
  if (!chunks.length) return;
  if (!actx) actx = new AudioContext({ sampleRate: kokoroTts.sampleRate });
  if (actx.state === "suspended") await actx.resume();
  emit({ phase: "speaking", engine: "kokoro" });
  let nextStart = actx.currentTime + 0.08;
  let last: AudioBufferSourceNode | null = null;
  for (const c of chunks) {
    const got = await kokoroTts.synthChunk(c.text, c.pause, !!c.seamless); // Worker 已把块尾停顿填进 PCM
    if (my !== gen) { stopKokoroPlayback(); return; }
    const buf = actx.createBuffer(1, got.pcm.length, got.sampleRate);
    buf.getChannelData(0).set(got.pcm);
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(actx.destination);
    const t = Math.max(nextStart, actx.currentTime + 0.02);
    src.start(t);
    nextStart = t + buf.duration;
    last = src;
    activeSources.push(src);
    src.onended = () => { activeSources = activeSources.filter((x) => x !== src); };
  }
  // 等待最后一块自然播完（gen 失效/取消立即返回）
  await new Promise<void>((resolve) => {
    if (!last) return resolve();
    let tick: ReturnType<typeof setInterval> | null = null;
    const finish = () => {
      if (tick) clearInterval(tick);
      activeSources = activeSources.filter((x) => x !== last);
      if (my === gen) emit({ phase: "idle", engine: "kokoro" });
      resolve();
    };
    last.onended = finish;
    tick = setInterval(() => { if (my !== gen) { stopKokoroPlayback(); finish(); } }, 200);
  });
}

// —— SAPI 播放（原 v2.9.1 实现，作为兜底）——
async function sapiSpeak(text: string, my: number, opts: { rate?: number }) {
  if (!ttsAvailable()) { emit({ phase: "error", engine: null, message: "没有可用的本地语音" }); return; }
  emit({ phase: "speaking", engine: "sapi" });
  clearKeepAlive();
  try { speechSynthesis.cancel(); } catch { /* noop */ }
  const clauses = splitSentences(text);
  keepAlive = setInterval(() => {
    if (my !== gen) { clearKeepAlive(); return; }
    try { speechSynthesis.resume(); } catch { /* noop */ }
  }, 4000);
  for (let i = 0; i < clauses.length; i++) {
    if (my !== gen) break;
    const { text: clause, pause } = clauses[i];
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(clause);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "en-US"; }
      u.rate = opts.rate ?? 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
    if (my !== gen) break;
    if (pause > 0 && i < clauses.length - 1) await wait(pause);
  }
  if (my === gen) { clearKeepAlive(); emit({ phase: "idle", engine: "sapi" }); }
}

export function stopSpeaking() {
  gen++;
  clearKeepAlive();
  stopKokoroPlayback();
  if (ttsAvailable()) { try { speechSynthesis.cancel(); } catch { /* noop */ } }
  emit({ phase: "idle", engine: null });
}

// 统一入口：Kokoro 已安装则走神经语音，任何失败/未安装无缝降级 SAPI
export function speak(text: string, opts: { rate?: number } = {}) {
  if (!text) return;
  const my = ++gen;
  clearKeepAlive();
  stopKokoroPlayback();
  if (ttsAvailable()) { try { speechSynthesis.cancel(); } catch { /* noop */ } }
  (async () => {
    try {
      if (await kokoroInstalled()) {
        await kokoroSpeak(text, my);
        return;
      }
    } catch (e) {
      if (my !== gen) return;
      console.warn("[tts] Kokoro 不可用，降级系统语音：", e);
      stopKokoroPlayback();
    }
    if (my === gen) await sapiSpeak(text, my, opts);
  })();
}

// 单词示范（跟读台点词听"标准读法"）：只收字母/撇号/连字符，加句号给词典式 citation 读法。
// 已知边界：Kokoro 为句级模型，孤立短词（尤其数字、极短功能词）偶发多余杂音，
// 社区通用建议是放回句子；跟读台保留整句「🔈 听示范」作为兜底。
export function speakWord(raw: string) {
  const w = String(raw || "").normalize("NFKC")
    .replace(/[^A-Za-z'’\-]/g, " ")
    .trim().split(/\s+/).filter(Boolean).join(" ");
  if (!w) return;
  speak(w.endsWith(".") ? w : w + ".");
}

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
  let drainedChars = 0; // 已排入队列的文本游标：防止重复 feed 时旧句子反复入队
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
    // 后面还排着句子时才在句末补短间隙；没有下一句则保留模型自然收尾
    if (chunks.length) chunks[chunks.length - 1].pause = queue.length ? SENTENCE_GAP_MS : 0;
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
      u.rate = 1.0;
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
    if (drainedChars > buffer.length) drainedChars = 0; // 防御：文本被整体替换
    const { queue: freshQueue, newDrainedChars } = planStreamQueue(buffer, drainedChars, isFinal);
    drainedChars = newDrainedChars;
    queue.push(...freshQueue);
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
