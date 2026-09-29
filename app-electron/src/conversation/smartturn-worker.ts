// Smart Turn 推理 Worker（独立 Worker，不阻塞 UI）。onnxruntime-web WASM（numThreads=1，
// 免 SharedArrayBuffer），模型与 ort wasm 全部走本地同源 dist/smartturn。
import * as ort from "onnxruntime-web";
import { smartTurnMel } from "./smartturn-mel.ts";

type InitMsg = { type: "init"; reqId: number; modelBase: string; ortBase: string };
type PredictMsg = { type: "predict"; run: number; pcm: Float32Array };
type Msg = InitMsg | PredictMsg | { type: "dispose"; reqId: number };

let session: ort.InferenceSession | null = null;

self.onmessage = async (e: MessageEvent<Msg>) => {
  const d = e.data;
  try {
    if (d.type === "init") {
      const wasmBuf = await (await fetch(d.ortBase + "ort-wasm-simd-threaded.wasm")).arrayBuffer();
      const wasm = ort.env.wasm;
      wasm.wasmBinary = new Uint8Array(wasmBuf);
      wasm.wasmPaths = { mjs: d.ortBase + "ort-wasm-simd-threaded.mjs" };
      wasm.numThreads = 1;
      wasm.simd = true;
      const t0 = performance.now();
      session = await ort.InferenceSession.create(d.modelBase + "smart-turn-v3.2-cpu.onnx", {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      self.postMessage({ type: "ready", reqId: d.reqId, ms: Math.round(performance.now() - t0) });
      return;
    }
    if (d.type === "predict") {
      if (!session) throw new Error("SmartTurn 未初始化");
      const t0 = performance.now();
      const feats = smartTurnMel(d.pcm);
      const tensor = new ort.Tensor("float32", feats, [1, 80, 800]);
      const out = await session.run({ input_features: tensor });
      const o = out[session.outputNames[0]];
      // v3.2-cpu 输出已是 sigmoid 概率（spike 验证：直接 0.5 阈值，无需再 sigmoid）
      const prob = Number(o.data[o.data.length - 1]);
      self.postMessage({ type: "result", run: d.run, ms: Math.round(performance.now() - t0), prob });
      return;
    }
    if (d.type === "dispose") {
      session = null;
      self.postMessage({ type: "disposed", reqId: d.reqId });
    }
  } catch (err) {
    self.postMessage({
      type: "fatal",
      reqId: (d as { reqId?: number }).reqId,
      run: (d as { run?: number }).run,
      message: String((err as Error)?.stack || err),
    });
  }
};
export {};
