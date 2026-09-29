// Kokoro 生产化闸门 entry：全部使用生产 src 服务（coordinator/asr/translator/kokoro）。
// 模型下载/深校验在真实应用里由主进程 IPC 完成；闸门用等价 mock 返回 app:// 运行时描述。
const RT: Record<string, { repo: string; revision: string; files: string[]; dtype: string; multilingual?: boolean }> = {
  "whisper-base": { repo: "Xenova/whisper-base", revision: "64da57285918e20ea79ea5c88eed7197933abaa8", dtype: "q8", multilingual: true,
    files: ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"] },
  "bergamot-enzh": { repo: "bergamot/enzh", revision: "llmaat-finetune10m-qe8-2024", dtype: "intgemm8",
    files: ["model.enzh.intgemm.alphas.bin", "lex.50.50.enzh.s2t.bin", "srcvocab.enzh.spm", "trgvocab.enzh.spm"] },
  "kokoro-82m": { repo: "onnx-community/Kokoro-82M-v1.0-ONNX", revision: "1939ad2a8e416c0acfeecc08a694d14ef25f2231", dtype: "q8",
    files: ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx", "voices/af_heart.bin"] },
};
(window as unknown as { electronAPI: unknown }).electronAPI = {
  modelStatus: async (id: string) => ({ state: "installed", manifest: { id, revision: RT[id]?.revision } }),
  modelRuntime: async (id: string) => {
    const r = RT[id];
    if (!r) throw new Error("gate mock 未知模型 " + id);
    return { base: "app://app/__model__", state: "installed", ...r };
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gc = () => { try { (globalThis as { gc?: () => void }).gc?.(); } catch { /* noop */ } };
const stage = (n: string) => console.log("SMOKE_STAGE " + n);

const { inference } = await import("../../src/inference/coordinator");
const { kokoroTts } = await import("../../src/tts-kokoro/kokoro");
const { asr } = await import("../../src/asr/asr");
const { translator } = await import("../../src/translate/translate");
const { planKokoroChunks } = await import("../../src/tts-chunks");

const PARAS = [
  "Researchers at the university announced a new method for translating languages entirely on the user's own computer.",
  "The model runs inside the browser and never sends text to a remote server, which protects reader privacy.",
  "Officials said the investigation produced no evidence that any serious irregularities took place during the election.",
  "A severe storm moved through the region overnight, leaving thousands of homes without power until morning.",
  "Reading difficult material every day is one of the most reliable ways to expand an adult learner's vocabulary.",
  "The committee praised the volunteers who worked through the night to distribute food and medicine to families.",
];

async function speakPlan(sentence: string) {
  const chunks = planKokoroChunks(sentence);
  const got = [];
  for (const c of chunks) {
    const t0 = performance.now();
    const r = await kokoroTts.synthChunk(c.text, c.pause, !!c.seamless);
    got.push({ words: c.text.split(/\s+/).length, pause: c.pause, seamless: !!c.seamless, synthMs: r.ms, wallMs: Math.round(performance.now() - t0), audioMs: r.audioMs, n: r.pcm.length });
  }
  return { chunks: got, totalAudioMs: got.reduce((s, g) => s + g.audioMs, 0) };
}

(async () => {
  const out: Record<string, unknown> = { steps: [] };
  try {
    gc(); await sleep(1000); stage("rss-baseline");

    // 1) ASR 租约（生产 asr 服务 + 生产 worker）
    await inference.acquire("asr");
    await asr.init("wasm", "whisper-base");
    const pcm = new Float32Array(16000);
    const tr = await asr.transcribe(pcm, { language: "en" });
    out.asr1 = { ms: tr.ms, text: tr.text };
    gc(); await sleep(2500); stage("rss-asr");

    // 2) ASR → Kokoro TTS（生产 coordinator 第三租约；acquire 内含 init+warm）
    await inference.release("asr");
    out.asrDisposedBeforeTts = !asr.isReady;
    const tAcq = performance.now();
    await inference.acquire("tts");
    out.ttsAcquireMs = Math.round(performance.now() - tAcq); // init+warm 总耗时（仅首次点击承担）
    out.tts1 = await speakPlan("Attention mechanisms allow parallel computation across all tokens.");
    out.tts1FirstChunkMs = (out.tts1 as { chunks: { wallMs: number }[] }).chunks[0].wallMs;
    out.tts2 = await speakPlan("Dr. Smith published 3.14 pages in the U.S. in 2024, earning 1,000 citations.");
    // 缩写/数字归一化耳听集：再合成两句，验证不崩、音频非空
    out.tts3 = await speakPlan("The meeting is at 9:15, and the ticket costs $12.50.");
    gc(); await sleep(2500); stage("rss-tts1");
    await inference.release("tts");
    out.ttsDisposed = !kokoroTts.isReady;
    gc(); await sleep(3000); stage("rss-tts1-disposed");

    // 3) 翻译租约（TTS 必须已退出）
    await inference.acquire("translation");
    const r = await translator.translate(PARAS, true);
    out.mt = { ms: r.ms, n: r.zh.length, empty: r.zh.filter((z) => !z.trim()).length, pairs: r.pairs.length, sample: r.zh[0].slice(0, 80) };
    gc(); await sleep(2500); stage("rss-mt");

    // 4) 翻译 → Kokoro 再起（水位可复现；worker 已销毁，需重新 init+warm）
    await inference.release("translation");
    out.mtDisposedBeforeTts2 = !translator.isReady;
    const tRe = performance.now();
    await inference.acquire("tts");
    out.ttsReacquireMs = Math.round(performance.now() - tRe);
    out.tts4 = await speakPlan("The transformer relies on multi-head self-attention and positional encodings.");
    gc(); await sleep(2500); stage("rss-tts2");
    await inference.release("tts");
    gc(); await sleep(7000); stage("rss-final");

    out.allReleased = !asr.isReady && !translator.isReady && !kokoroTts.isReady;
    console.log("SMOKE_RESULT " + JSON.stringify(out));
  } catch (e) {
    console.log("SMOKE_FAIL " + ((e as Error)?.stack || String(e)));
  }
})();
