// 闸门③-b 入口（经 vite 单文件构建进 dist/__gate3.js）：用生产代码 inference 协调器
// 在同一渲染进程内做 ASR→翻译→ASR 的真实租约切换，验证旧 Worker 退出、RSS 回落与抢占串行。
import { asr } from "../../src/asr/asr";
import { translator } from "../../src/translate/translate";
import { inference } from "../../src/inference/coordinator";

const log = (...a: unknown[]) => console.log("SMOKE_STAGE " + a.join(" "));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gc = () => { try { (globalThis as { gc?: () => void }).gc?.(); } catch { /* noop */ } };
const out: Record<string, unknown> = { steps: [] };

const PARAS = [
  "Researchers at the university announced a new method for translating languages entirely on the user's own computer.",
  "The model runs inside the browser and never sends text to a remote server, which protects reader privacy.",
  "Officials said the investigation produced no evidence that any serious irregularities took place during the election.",
  "A severe storm moved through the region overnight, leaving thousands of homes without power until morning.",
  "Reading difficult material every day is one of the most reliable ways to expand an adult learner's vocabulary.",
  "The committee praised the volunteers who worked through the night to distribute food and medicine to families.",
  "Ordinary citizens gathered outside the building to express both support and opposition in entirely peaceful ways.",
  "Lawyers argued that the evidence presented during the hearing did not support the claims made on social media.",
  "The new semiconductor factory will create roughly two thousand jobs when it begins production next year.",
  "Scientists warned that rising ocean temperatures could alter migration patterns for several species of whales.",
  "The mayor described the agreement as a practical compromise that addressed the concerns of both neighboring towns.",
  "According to the report, children who read for pleasure tend to perform better in mathematics and science later.",
];

async function transcribeSilence(seconds = 1) {
  const pcm = new Float32Array(16000 * seconds); // 纯静音 PCM
  const r = await asr.transcribe(pcm, { language: "en" });
  return { ms: r.ms, text: r.text, nwords: r.words.length };
}

(async () => {
  try {
    // —— 阶段 0：基线 ——
    gc(); await sleep(1000); log("rss-baseline");

    // —— 阶段 1：ASR 租约（whisper-base 真实加载 + 一次转写）——
    await inference.acquire("asr");
    await asr.init("wasm", "whisper-base");
    out.asr1 = await transcribeSilence();
    gc(); await sleep(2500); log("rss-asr");

    // —— 阶段 2：切到翻译租约（协调器必须先销毁 ASR）——
    await inference.acquire("translation");
    out.asrDisposedAfterAcquireMt = !asr.isReady;
    const r = await translator.translate(PARAS, true);
    out.mt = {
      ms: r.ms, n: r.zh.length, empty: r.zh.filter((z) => !z.trim()).length,
      pairsPerPara: r.pairs.map((p) => p.length), sample: r.zh[0].slice(0, 100),
    };
    gc(); await sleep(2500); log("rss-mt");

    // —— 阶段 3：切回 ASR（协调器必须先销毁翻译 Worker，~530MB 应可回收）——
    await inference.acquire("asr");
    out.mtDisposedAfterAcquireAsr = !translator.isReady;
    await asr.init("wasm", "whisper-base");
    out.asr2 = await transcribeSilence();
    gc(); await sleep(2500); log("rss-asr2");

    // —— 阶段 4：释放全部租约 ——
    await inference.release("asr");
    out.allReleased = !asr.isReady && !translator.isReady;
    gc(); await sleep(6000); log("rss-final");

    // —— 阶段 5：并发抢占必须串行（mt → asr → mt，顺序不允许乱）——
    const order: string[] = [];
    const p1 = inference.acquire("translation").then(() => order.push("mt1"));
    const p2 = inference.acquire("asr").then(() => order.push("asr2"));
    const p3 = inference.acquire("translation").then(() => order.push("mt3"));
    await Promise.all([p1, p2, p3]);
    out.order = order;
    out.serialized = order.join(",") === "mt1,asr2,mt3";
    await inference.release("translation");
    gc();

    console.log("SMOKE_RESULT " + JSON.stringify(out));
  } catch (e) {
    console.log("SMOKE_FAIL " + ((e as Error)?.stack || String(e)));
  }
})();
