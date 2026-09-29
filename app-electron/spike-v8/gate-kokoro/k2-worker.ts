// S7c 对照实验：用生产 transformers 3.8.1（ASR 同款、本机已验证）直接加载 Kokoro 模型，
// 绕开 kokoro.web.js 自带的 3.5.1 bundle，定位挂死是否在 bundle 运行时。
import { AutoModel, AutoTokenizer, Tensor, env } from "@huggingface/transformers";
import { phonemize } from "phonemizer";

const COMMIT7 = "1939ad2";
const REPO = "onnx-community/Kokoro-82M-v1.0-ONNX";
const SR = 24000;
const VOICE = "af_heart";

// 线程数由页面显式传入（不封 navigator.hardwareConcurrency，测真实核扩展）
try {
  const noopCache = { match: async () => undefined, put: async () => undefined, add: async () => undefined, addAll: async () => undefined, delete: async () => true, keys: async () => [] };
  Object.defineProperty(globalThis, "caches", {
    value: { open: async () => noopCache, keys: async () => [], has: async () => false, delete: async () => true },
    configurable: true, writable: true,
  });
} catch { /* noop */ }

const origFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const u = String(typeof input === "object" && "url" in (input as object) ? (input as Request).url : input);
  console.log("K2FETCH " + u);
  const hf = u.match(/^https:\/\/huggingface\.co\/(.+?)\/resolve\/[^/]+\/(.+)$/);
  if (hf) return origFetch(`/__kokoro__/${hf[1]}/resolve/${COMMIT7}/${hf[2]}`, init);
  return origFetch(u as any, init);
}) as typeof fetch;

let model: any = null;
let tokenizer: any = null;

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data;
  const reply = (o: object) => (self as any).postMessage(o);
  try {
    if (msg.cmd === "init") {
      env.allowLocalModels = false;
      env.useBrowserCache = false;
      env.remoteHost = "app://app/__kokoro__";
      env.remotePathTemplate = "{model}/resolve/" + COMMIT7 + "/";
      const wasm = env.backends.onnx.wasm!;
      const wasmBuf = await (await fetch("/ort/ort-wasm-simd-threaded.jsep.wasm")).arrayBuffer();
      wasm.wasmBinary = new Uint8Array(wasmBuf);
      wasm.wasmPaths = { mjs: "/ort/ort-wasm-simd-threaded.jsep.mjs" };
      wasm.numThreads = msg.threads ?? 1;

      const t0 = performance.now();
      tokenizer = await AutoTokenizer.from_pretrained(REPO, { revision: COMMIT7 });
      model = await AutoModel.from_pretrained(REPO, { dtype: "q8", device: "wasm", revision: COMMIT7 });
      reply({ type: "inited", ms: Math.round(performance.now() - t0) });
      return;
    }
    if (msg.cmd === "run") {
      const t0 = performance.now();
      const t1 = performance.now();
      const ph = (await phonemize(msg.text, "en-us")).join(" ");
      const phonMs = Math.round(performance.now() - t1);
      const { input_ids } = tokenizer(ph, { truncation: true });
      // 音色向量（本地镜像）
      const vbuf = await (await fetch(`/__kokoro__/${REPO}/resolve/${COMMIT7}/voices/${VOICE}.bin`)).arrayBuffer();
      const voiceAll = new Float32Array(vbuf);
      const l = 256 * Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509);
      const style = voiceAll.slice(l, l + 256);
      const t2 = performance.now();
      const out = await model({
        input_ids,
        style: new Tensor("float32", style, [1, 256]),
        speed: new Tensor("float32", [1], [1]),
      });
      const runMs = Math.round(performance.now() - t2);
      const wf = out.waveform ?? out.logits;
      const samples = new Float32Array(wf.data as ArrayBuffer);
      reply({
        type: "ran", id: msg.id, samples: samples.buffer,
        phonMs, runMs, totalMs: Math.round(performance.now() - t0), audioMs: samples.length / SR,
        phonemes: ph.slice(0, 160), outKeys: Object.keys(out),
      }, [samples.buffer]);
    }
  } catch (e) {
    reply({ type: "error", id: msg?.id, error: String((e as Error)?.stack || e) });
  }
};
