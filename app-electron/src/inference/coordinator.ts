// 推理运行时租约（ADR-4 闸门③ / ADR-5 / ADR-6 约束④）：
// ASR、翻译、TTS Worker 各占 600MB–1GB RSS，三者互斥；LLM（WebLLM）为会话级常驻，
// 语音会话期间 ASR/TTS 按轮获取与释放、与 LLM 共存，但 ASR 与 TTS 不同时驻留。
// acquire 全部串行排队，切换过程串进同一条 promise 链，防止并发抢占。
import { asr } from "../asr/asr";
import { translator } from "../translate/translate";
import { kokoroTts } from "../tts-kokoro/kokoro";
import { localEngine } from "../conversation/runtime";

export type InferenceKind = "asr" | "translation" | "tts" | "llm";
type TurnKind = "asr" | "translation" | "tts";

class InferenceCoordinator {
  private chain: Promise<unknown> = Promise.resolve();
  private turn: TurnKind | null = null;
  private llm = false;

  get current() { return this.turn; }
  get llmActive() { return this.llm; }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.then(() => undefined, () => undefined);
    return next;
  }

  private async teardownTurn(): Promise<void> {
    if (asr.isReady) await asr.dispose();
    if (translator.isReady) await translator.dispose();
    if (kokoroTts.isReady) await kokoroTts.dispose();
    this.turn = null;
  }

  acquire(kind: InferenceKind): Promise<void> {
    return this.runExclusive(async () => {
      if (kind === "llm") {
        // 进入语音会话：销毁全部按轮运行时；LLM 引擎加载由调用方 ensureEngine 完成
        await this.teardownTurn();
        this.llm = true;
        return;
      }
      if (kind === "asr") {
        if (kokoroTts.isReady) await kokoroTts.dispose();
        if (translator.isReady) await translator.dispose();
        // LLM 会话级常驻、不销毁；asr.init(...) 由调用方在 acquire 之后自行调用
      } else if (kind === "tts") {
        if (asr.isReady) await asr.dispose();
        if (translator.isReady) await translator.dispose();
        await kokoroTts.init(); // 模型未安装会抛错，由 tts.ts 捕获并降级 SAPI
      } else {
        if (asr.isReady) await asr.dispose();
        if (kokoroTts.isReady) await kokoroTts.dispose();
        await translator.init();
      }
      this.turn = kind;
    });
  }

  release(kind: InferenceKind): Promise<void> {
    return this.runExclusive(async () => {
      if (kind === "llm") {
        if (!this.llm) return;
        await localEngine.unload();
        this.llm = false;
        return;
      }
      if (this.turn !== kind) return;
      if (kind === "asr") await asr.dispose();
      else if (kind === "tts") await kokoroTts.dispose();
      else await translator.dispose();
      this.turn = null;
    });
  }
}

export const inference = new InferenceCoordinator();
