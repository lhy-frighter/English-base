// V8-3a 推理租约共存闸门（?lease=v8）：
// LLM 会话级常驻；ASR/TTS 按轮获取，切换时旧方销毁、LLM 不被销毁；最终全部释放。
import { inference } from "../inference/coordinator";
import { localEngine, CURRENT_MODEL } from "../conversation/runtime";
import { asr } from "../asr/asr";

function heapMB(): number {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : -1;
}
const log = (s: string) => console.log("V8LEASE " + s);

async function run(): Promise<void> {
  try {
    // 1) 进入会话：获取 llm 租约并加载引擎
    await inference.acquire("llm");
    await localEngine.load(CURRENT_MODEL);
    log("llm_loaded heapMB " + heapMB());

    // 2) 语音输入轮：asr 获取后 LLM 仍常驻
    await inference.acquire("asr");
    await asr.init("wasm", "whisper-base");
    log("asr_ready llmStill=" + localEngine.isLoaded(CURRENT_MODEL) + " heapMB " + heapMB());
    if (!localEngine.isLoaded(CURRENT_MODEL)) throw new Error("asr 获取期间 LLM 被销毁");

    // 3) 切到语音输出：asr 必须已销毁，LLM 仍常驻（acquire 内部 init kokoro）
    await inference.acquire("tts");
    log("tts_ready asrGone=" + !asr.isReady + " llmStill=" + localEngine.isLoaded(CURRENT_MODEL) + " heapMB " + heapMB());
    if (asr.isReady) throw new Error("tts 获取前 asr 未销毁");
    if (!localEngine.isLoaded(CURRENT_MODEL)) throw new Error("tts 获取期间 LLM 被销毁");

    // 4) 收尾：释放 tts、llm
    await inference.release("tts");
    await inference.release("llm");
    log("all_released heapMB " + heapMB());
    log("DONE");
  } catch (e) {
    log("FATAL " + ((e as Error).message || String(e)));
  }
}

void run();
