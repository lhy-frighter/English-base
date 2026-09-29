// S7c 闸门 Worker（3.8.1 直连版）：生产同款 @huggingface/transformers 3.8.1 + vendor phonemizer，
// 绕开 kokoro.web.js 自带 3.5.1 bundle（该 bundle 在本机 Worker 内 session.run 永久挂死）。
import { AutoModel, AutoTokenizer, Tensor, env } from "@huggingface/transformers";
import { phonemize } from "phonemizer";
import { splitClauses } from "../../src/tts-chunks";

const COMMIT7 = "1939ad2";
const REPO = "onnx-community/Kokoro-82M-v1.0-ONNX";
const SR = 24000;
const VOICE = "af_heart";

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

function concat(parts: Float32Array[]): Float32Array {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function synth(text: string): Promise<{ samples: Float32Array; phonemes: string; phonMs: number; runMs: number }> {
  const t1 = performance.now();
  const ph = (await phonemize(text, "en-us")).join(" ");
  const phonMs = Math.round(performance.now() - t1);
  const { input_ids } = tokenizer(ph, { truncation: true });
  if (!voiceAll) {
    const vbuf = await (await fetch(`/__kokoro__/${REPO}/resolve/${COMMIT7}/voices/${VOICE}.bin`)).arrayBuffer();
    voiceAll = new Float32Array(vbuf);
  }
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
  return { samples: new Float32Array(wf.data as ArrayBuffer), phonemes: ph, phonMs, runMs };
}

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data;
  const reply = (o: object, transfer?: Transferable[]) => (self as any).postMessage(o, transfer ?? []);
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
      wasm.numThreads = msg.threads ?? 8;
      const t0 = performance.now();
      tokenizer = await AutoTokenizer.from_pretrained(REPO, { revision: COMMIT7 });
      model = await AutoModel.from_pretrained(REPO, { dtype: "q8", device: "wasm", revision: COMMIT7 });
      reply({ type: "inited", ms: Math.round(performance.now() - t0), threads: wasm.numThreads });
      return;
    }
    if (msg.cmd === "run") {
      const tAll = performance.now();
      if (msg.mode === "pauses") {
        const clauses = splitClauses(msg.text);
        const parts: Float32Array[] = [];
        const chunks: { text: string; synthMs: number; audioMs: number }[] = [];
        let phonemes = "";
        for (let i = 0; i < clauses.length; i++) {
          const ta = performance.now();
          const got = await synth(clauses[i].text);
          chunks.push({ text: clauses[i].text, synthMs: Math.round(performance.now() - ta), audioMs: +(got.samples.length / SR).toFixed(2) });
          phonemes += got.phonemes + " | ";
          parts.push(got.samples);
          if (i < clauses.length - 1 && clauses[i].pause > 0) {
            parts.push(new Float32Array(Math.round((clauses[i].pause / 1000) * SR)));
          }
        }
        const total = concat(parts);
        reply({
          type: "ran", id: msg.id, mode: "pauses", phonemes,
          samples: total.buffer, synthMs: Math.round(performance.now() - tAll), audioMs: total.length / SR, chunks,
        }, [total.buffer]);
      } else {
        const got = await synth(msg.text);
        reply({
          type: "ran", id: msg.id, mode: "native", phonemes: got.phonemes,
          samples: got.samples.buffer, synthMs: Math.round(performance.now() - tAll), audioMs: got.samples.length / SR, chunks: null,
        }, [got.samples.buffer]);
      }
    }
  } catch (e) {
    reply({ type: "error", id: msg?.id, error: String((e as Error)?.stack || e) });
  }
};
