// VAD 控制器：校验随包资产 → 创建 MicVAD（Silero v5），对外只暴露 start/pause/destroy。
// VAD 体积极小（模型 2.3MB）且需要与 TTS 同时运行（barge-in 检测），不进 InferenceCoordinator
// 互斥租约，由对话页按会话生命周期单独管理。

import { MicVAD } from "@ricky0123/vad-web";
import { VAD_ASSET_MANIFEST, VAD_MODEL } from "./vad-manifest";

export interface VadHandlers {
  // 回调带时间戳（performance.now()），供 TurnAssembler 计算段间真实间隔
  onSpeechStart?: (t: number) => void;
  onSpeechRealStart?: (t: number) => void;
  onSpeechEnd: (audio: Float32Array, t: number) => void;
  onMisfire?: () => void;
  onStateChange?: (speaking: boolean) => void;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ortConfig 回调收到的是 onnxruntime-web/wasm 命名空间（其 .d.ts 未声明 env），用 any 访问
function configureOrt(ort: any): void {
  const isolated = typeof crossOriginIsolated === "boolean" ? crossOriginIsolated : true;
  ort.env.wasm.numThreads = isolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  ort.env.wasm.simd = true;
}

async function verifyAssets(base: string): Promise<void> {
  for (const spec of VAD_ASSET_MANIFEST) {
    const res = await fetch(base + spec.path);
    if (!res.ok) throw new Error(`vad_asset_missing: ${spec.path}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength !== spec.bytes) throw new Error(`vad_asset_size: ${spec.path}`);
    const sha = await sha256Hex(buf);
    if (sha !== spec.sha256) throw new Error(`vad_asset_hash: ${spec.path}`);
  }
}

export class VadController {
  private mic: MicVAD;

  private constructor(mic: MicVAD) {
    this.mic = mic;
  }

  static async create(handlers: VadHandlers): Promise<VadController> {
    const base = new URL("vad/", document.baseURI).href;
    const ortBase = new URL("vad/ort/", document.baseURI).href;
    await verifyAssets(base);
    let mic: MicVAD;
    try {
      mic = await MicVAD.new({
        baseAssetPath: base,
        onnxWASMBasePath: ortBase,
        model: VAD_MODEL,
        ortConfig: configureOrt,
        getStream: () =>
          navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          }),
        onSpeechStart: () => {
          handlers.onStateChange?.(true);
          handlers.onSpeechStart?.(performance.now());
        },
        onSpeechRealStart: () => {
          handlers.onSpeechRealStart?.(performance.now());
        },
        onSpeechEnd: (audio) => {
          handlers.onStateChange?.(false);
          handlers.onSpeechEnd(audio, performance.now());
        },
        onVADMisfire: () => {
          handlers.onStateChange?.(false);
          handlers.onMisfire?.();
        },
      });
    } catch (e) {
      throw new Error("vad_init_failed: " + (e instanceof Error ? e.message : String(e)));
    }
    return new VadController(mic);
  }

  start(): void {
    if (!this.mic.listening) this.mic.start();
  }

  pause(): void {
    if (this.mic.listening) this.mic.pause();
  }

  get isListening(): boolean {
    return this.mic.listening;
  }

  async destroy(): Promise<void> {
    await this.mic.destroy();
  }
}
