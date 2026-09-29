// V6 ASR 推理 Worker（ADR-3：模型永不上主线程）。transformers.js v3，模型与 ort wasm 全部走本地 app:// 同源。
import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

type InitMsg = { type: "init"; reqId: number; modelId: string; modelBase: string; revision: string; threads: number; device: "wasm" | "webgpu"; multilingual?: boolean };
type RunMsg = { type: "transcribe"; pcm: Float32Array; run: number; language?: string };
type Msg = InitMsg | RunMsg | { type: "dispose"; reqId: number };
type Word = { w: string; t: [number, number | null] };

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let multilingual = false;

self.onmessage = async (e: MessageEvent<Msg>) => {
  const d = e.data;
  try {
    if (d.type === "init") {
      env.allowLocalModels = false;
      // 完整性由主进程在加载前按可信清单深校验；关闭浏览器缓存，避免再复制一份未受校验的模型副本
      env.useBrowserCache = false;
      env.remoteHost = d.modelBase; // app://app/__model__
      // worker 打包到 /assets，ort 运行时拷到 /ort（见 vite.config）
      const ortBase = /* @vite-ignore */ new URL("../ort/", import.meta.url).href;
      // ort-web 1.22-dev 只发布 simd-threaded 产物；实测 numThreads=1 且 crossOriginIsolated=false 时
      // 该产物走单线程路径、不依赖 SharedArrayBuffer（probe-noiso 冒烟：503ms 就绪、转写正确），故单/多线程共用此文件。
      const variant = d.device === "webgpu" ? "ort-wasm-simd-threaded.jsep" : "ort-wasm-simd-threaded";
      const wasmBuf = await (await fetch(ortBase + variant + ".wasm")).arrayBuffer();
      const wasm = env.backends.onnx.wasm!;
      wasm.wasmBinary = new Uint8Array(wasmBuf);
      wasm.wasmPaths = { mjs: ortBase + variant + ".mjs" };
      wasm.numThreads = d.threads;
      const t0 = performance.now();
      const makePipeline = pipeline as unknown as (
        task: string, model: string, opts: unknown
      ) => Promise<AutomaticSpeechRecognitionPipeline>;
      // revision 固定 commit，transformers 据此请求 /resolve/<commit>/，不随 main 漂移
      asr = await makePipeline("automatic-speech-recognition", d.modelId, { device: d.device, dtype: "q8", revision: d.revision });
      multilingual = !!d.multilingual;
      self.postMessage({ type: "ready", reqId: d.reqId, ms: Math.round(performance.now() - t0), threads: d.threads, device: d.device });
      return;
    }
    if (d.type === "transcribe") {
      if (!asr) throw new Error("ASR 未初始化");
      const t0 = performance.now();
      // 多语模型必须显式 task=transcribe（否则可能走 translate 译成英文）；language 缺省时自动检测语种
      const genOpts: Record<string, unknown> = { return_timestamps: "word", chunk_length_s: 0 };
      if (multilingual) { genOpts.task = "transcribe"; if (d.language) genOpts.language = d.language; }
      const out = (await asr(d.pcm, genOpts)) as {
        text: string; chunks?: { text: string; timestamp: [number, number | null] }[];
      };
      const words: Word[] = (out.chunks || []).map((c) => {
        const [s, e2] = c.timestamp;
        return { w: c.text.trim(), t: [Math.round(s * 100) / 100, e2 == null ? null : Math.round(e2 * 100) / 100] };
      });
      self.postMessage({ type: "result", run: d.run, ms: Math.round(performance.now() - t0), text: out.text.trim(), words });
      return;
    }
    if (d.type === "dispose") {
      asr?.dispose?.();
      asr = null;
      self.postMessage({ type: "disposed", reqId: d.reqId });
    }
  } catch (err) {
    self.postMessage({ type: "fatal", reqId: (d as { reqId?: number }).reqId, run: (d as { run?: number }).run, message: String((err as Error)?.stack || err) });
  }
};
export {};
