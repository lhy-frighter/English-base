// ADR-5 Kokoro 本地神经 TTS 推理 Worker（模型永不上主线程）。
// 关键结论（S7c spike）：不用 kokoro-js 自足 bundle（内联 transformers 3.5.1，在本环境
// Worker 内 session.run 永久挂死）；改用项目锁定的 @huggingface/transformers 3.8.x 直连
// 同一 Kokoro 模型，vendor phonemizer@1.2.1（内联 eSpeak NG，GPL-3.0，见 THIRD_PARTY_NOTICES）。
// env/wasm/线程/校验范式与 src/asr/worker.ts 一致：模型只读走 app://__model__，useBrowserCache=false。
import { AutoModel, AutoTokenizer, Tensor, env } from "@huggingface/transformers";
import { phonemize } from "phonemizer";

const SR = 24000;
const VOICE_FILE = "voices/af_heart.bin"; // 生产切片只随模型下载 af_heart 一个音色

// app:// 下 CacheStorage 的 quota db 打不开会挂起；no-op 桩，模型/音色一律走主进程本地协议
try {
  const noopCache = { match: async () => undefined, put: async () => undefined, add: async () => undefined, addAll: async () => undefined, delete: async () => true, keys: async () => [] };
  Object.defineProperty(globalThis, "caches", {
    value: { open: async () => noopCache, keys: async () => [], has: async () => false, delete: async () => true },
    configurable: true, writable: true,
  });
} catch { /* noop */ }

let model: any = null;
let tokenizer: any = null;
let voiceAll: Float32Array | null = null;
let voiceUrl = "";

// —— 文本归一化（移植 kokoro-js@1.2.1 dist/kokoro.js 的 m()，Apache-2.0）——
// 年份/时间读法
function normNumberToken(e: string): string {
  if (e.includes(":")) {
    const [a, t] = e.split(":").map(Number);
    if (t === 0) return `${a} o'clock`;
    if (t < 10) return `${a} oh ${t}`;
    return `${a} ${t}`;
  }
  const n = parseInt(e.slice(0, 4), 10);
  if (n < 1100 || n % 1000 < 10) return e;
  const t = e.slice(0, 2);
  const r = parseInt(e.slice(2, 4), 10);
  const s = e.endsWith("s") ? "s" : "";
  if (n % 1000 >= 100 && n % 1000 <= 999) {
    if (r === 0) return `${t} hundred${s}`;
    if (r < 10) return `${t} oh ${r}${s}`;
  }
  return `${t} ${r}${s}`;
}
// 货币读法
function normCurrency(e: string): string {
  const unit = e[0] === "$" ? "dollar" : "pound";
  if (isNaN(Number(e.slice(1)))) return `${e.slice(1)} ${unit}s`;
  if (!e.includes(".")) {
    const plural = e.slice(1) === "1" ? "" : "s";
    return `${e.slice(1)} ${unit}${plural}`;
  }
  const [w, d] = e.slice(1).split(".");
  const cents = parseInt(d.padEnd(2, "0"), 10);
  const unitPlural = w === "1" ? "" : "s";
  const smallName = e[0] === "$"
    ? cents === 1 ? "cent" : "cents"
    : cents === 1 ? "penny" : "pence";
  return `${w} ${unit}${unitPlural} and ${cents} ${smallName}`;
}

export function normalizeText(input: string): string {
  return input
    .replace(/[‘’]/g, "'")
    .replace(/«/g, "“").replace(/»/g, "”")
    .replace(/[“”]/g, '"')
    .replace(/\(/g, "«").replace(/\)/g, "»")
    .replace(/、/g, ", ").replace(/。/g, ". ").replace(/！/g, "! ")
    .replace(/，/g, ", ").replace(/：/g, ": ").replace(/；/g, "; ").replace(/？/g, "? ")
    .replace(/[^\S \n]/g, " ")
    .replace(/  +/g, " ")
    .replace(/(?<=\n) +(?=\n)/g, "")
    .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
    .replace(/\betc\.(?! [A-Z])/gi, "etc")
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, normNumberToken)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, normCurrency)
    .replace(/\d*\.\d+/g, (e) => { const [a, t] = e.split("."); return `${a} point ${t.split("").join(" ")}`; })
    .replace(/(?<=\d)-(?=\d)/g, " to ")
    .replace(/(?<=\d)S/g, " S")
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, "s")
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (e) => e.replace(/\./g, "-"))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")
    .trim();
}

// Kokoro 音素后处理（同 m() 尾部替换）
function postPhonemes(ph: string, accent: "a" | "b"): string {
  let s = ph
    .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ")
    .replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
    .replace(/ʲ/g, "j")
    .replace(/r/g, "ɹ")
    .replace(/x/g, "k")
    .replace(/ɬ/g, "l")
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ")
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, "z");
  if (accent === "a") s = s.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di");
  return s.trim();
}

async function loadVoice(): Promise<Float32Array> {
  if (voiceAll) return voiceAll;
  const res = await fetch(voiceUrl);
  if (!res.ok) throw new Error("音色下载失败: HTTP " + res.status);
  voiceAll = new Float32Array(await res.arrayBuffer());
  return voiceAll;
}

// 硬切块（意群中间被"首块≤6词"规则切开）不能带模型自带的句尾静音，否则会在非停顿点
// 产生断层；裁掉尾部近零样本、保留约 120ms 自然收尾。自然意群边界（逗号/句末）不裁，
// 保留用户耳朵裁决过的 pauses 版节奏。
function trimTrailingSilence(pcm: Float32Array, keepMs = 120): Float32Array {
  const floor = 0.012;
  const release = Math.round((SR * 50) / 1000);
  let end = pcm.length;
  const minKeep = Math.round((SR * keepMs) / 1000);
  while (end > minKeep && Math.abs(pcm[end - 1]) < floor) end--;
  return pcm.slice(0, Math.min(pcm.length, end + release));
}

async function synth(text: string): Promise<{ samples: Float32Array; phonemes: string; phonMs: number; runMs: number }> {
  const norm = normalizeText(text);
  const t1 = performance.now();
  const rawPh = (await phonemize(norm, "en-us")).join(" ");
  const ph = postPhonemes(rawPh, "a");
  const phonMs = Math.round(performance.now() - t1);
  const { input_ids } = tokenizer(ph, { truncation: true });
  const voice = await loadVoice();
  const l = 256 * Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509);
  const style = voice.slice(l, l + 256);
  const t2 = performance.now();
  const out = await model({
    input_ids,
    style: new Tensor("float32", style, [1, 256]),
    speed: new Tensor("float32", [1], [1]),
  });
  const runMs = Math.round(performance.now() - t2);
  const wf = out.waveform ?? out.logits;
  return { samples: new Float32Array(wf.data as ArrayBuffer), phonemes: ph, phonMs, runMs };
}

function concat(parts: Float32Array[]): Float32Array {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

interface InitMsg { type: "init"; reqId: number; modelBase: string; repo: string; revision: string; threads: number }
interface WarmMsg { type: "warm"; reqId: number }
interface ChunkMsg { type: "chunk"; id: number; text: string; pauseMs: number; seamless?: boolean }
interface DisposeMsg { type: "dispose"; reqId: number }
type Msg = InitMsg | WarmMsg | ChunkMsg | DisposeMsg;

self.onmessage = async (e: MessageEvent<Msg>) => {
  const d = e.data;
  try {
    if (d.type === "init") {
      env.allowLocalModels = false;
      env.useBrowserCache = false; // 不向 Chromium 缓存再复制一份模型
      env.remoteHost = d.modelBase; // app://app/__model__
      env.remotePathTemplate = "{model}/resolve/" + d.revision + "/";
      voiceUrl = `${d.modelBase}/${d.repo}/resolve/${d.revision}/${VOICE_FILE}`;
      const ortBase = /* @vite-ignore */ new URL("../ort/", import.meta.url).href;
      // 与 S7c 闸门一致使用 jsep 变体（gate-kokoro 验证通过）；单/多线程共用同一 wasm
      const variant = "ort-wasm-simd-threaded.jsep";
      const wasmBuf = await (await fetch(ortBase + variant + ".wasm")).arrayBuffer();
      const wasm = env.backends.onnx.wasm!;
      wasm.wasmBinary = new Uint8Array(wasmBuf);
      wasm.wasmPaths = { mjs: ortBase + variant + ".mjs" };
      wasm.numThreads = d.threads;
      const t0 = performance.now();
      tokenizer = await AutoTokenizer.from_pretrained(d.repo, { revision: d.revision });
      model = await AutoModel.from_pretrained(d.repo, { dtype: "q8", device: "wasm", revision: d.revision });
      self.postMessage({ type: "ready", reqId: d.reqId, ms: Math.round(performance.now() - t0), threads: wasm.numThreads });
      return;
    }
    if (d.type === "warm") {
      if (!model || !tokenizer) throw new Error("TTS 未初始化");
      const t0 = performance.now();
      // 短寒暄 + 6 词正常句：把音色加载、首轮图编译与常见长度的惰性分配都挡在真实播放之前
      await synth("Hello.");
      await synth("The quick brown fox jumps over the lazy dog.");
      self.postMessage({ type: "warmed", reqId: d.reqId, ms: Math.round(performance.now() - t0) });
      return;
    }
    if (d.type === "chunk") {
      if (!model || !tokenizer) throw new Error("TTS 未初始化");
      const t0 = performance.now();
      const got = await synth(d.text);
      const body = d.seamless ? trimTrailingSilence(got.samples) : got.samples;
      const parts = [body];
      if (d.pauseMs > 0) parts.push(new Float32Array(Math.round((d.pauseMs / 1000) * SR)));
      const all = concat(parts);
      const msg = {
        type: "chunk", id: d.id, samples: all.buffer,
        ms: Math.round(performance.now() - t0), phonMs: got.phonMs, runMs: got.runMs, audioMs: Math.round((all.length / SR) * 1000),
        trimmed: d.seamless ? got.samples.length - body.length : 0,
      };
      // tsconfig 未启用 WebWorker lib（self 按 Window 推断），这里显式按 Worker 传输语义调用
      (self.postMessage as (m: unknown, transfer?: Transferable[]) => void)(msg, [all.buffer as ArrayBuffer]);
      return;
    }
    if (d.type === "dispose") {
      try { model?.dispose?.(); } catch { /* noop */ }
      model = null; tokenizer = null; voiceAll = null;
      self.postMessage({ type: "disposed", reqId: d.reqId });
    }
  } catch (err) {
    self.postMessage({ type: "fatal", reqId: (d as { reqId?: number }).reqId, id: (d as { id?: number }).id, message: String((err as Error)?.stack || err) });
  }
};
export {};
