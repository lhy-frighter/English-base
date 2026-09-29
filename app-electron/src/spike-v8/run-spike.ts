// V8-1 WebLLM 真机 spike（渲染进程；仅在 index.html?spike=v8 时运行）
// 内容：WebGPU 探测 → 模型加载（计时）→ 20 个冻结教学场景（首 token/总时延、质量断言）
//      → 打断/中断演练 → SRI fail-deny 验证 → 输出汇总（main 捕获 V8SPIKE 行）
import * as webllm from "@mlc-ai/web-llm";

const log = (s: string) => console.log("V8SPIKE " + s);
const MODEL_ID = new URLSearchParams(location.search).get("model") || "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";
const SPIKE_MODE = new URLSearchParams(location.search).get("mode") || "full";

const SYSTEM = [
  "You are a friendly English tutor for a Chinese-speaking learner at CEFR B1.",
  "Keep replies short: 2 to 4 sentences. Use B1-level vocabulary; explain any harder word in simple English.",
  "If the learner makes a grammar or word-choice mistake, gently correct it using the exact pattern 'Better:' followed by the corrected sentence.",
  "When appropriate, end with one follow-up question to keep the conversation going. Never use Chinese."
].join(" ");

// 20 个冻结场景
interface Scenario { kind: string; say: string; ok: (out: string) => boolean; }
const has = (o: string, w: string) => o.toLowerCase().includes(w.toLowerCase());
const correctionScenarios: Scenario[] = [
  { kind: "correct", say: "Yesterday I go to the library with my roommate.",
    ok: (o) => has(o, "went") },
  { kind: "correct", say: "I am 20 year old and I study electrical engineering.",
    ok: (o) => has(o, "years") },
  { kind: "correct", say: "She don't like coffee, so we usually order tea.",
    ok: (o) => has(o, "doesn't") || has(o, "does not") },
  { kind: "correct", say: "I am interesting in machine learning and embedded systems.",
    ok: (o) => has(o, "interested") },
  { kind: "correct", say: "After class I want buy a new keyboard for my laptop.",
    ok: (o) => has(o, "want to buy") || has(o, "wanted to buy") },
  { kind: "correct", say: "There have many students in the lab at night.",
    ok: (o) => has(o, "there are") },
];
const ieltsScenarios: Scenario[] = [
  { kind: "ielts", say: "I usually walk to campus because it is not far from my dorm.",
    ok: (o) => o.includes("?") },
  { kind: "ielts", say: "My favorite subject is control engineering; I find it very practical.",
    ok: (o) => o.includes("?") },
  { kind: "ielts", say: "On weekends I often work on the intelligent car project with my team.",
    ok: (o) => o.includes("?") },
  { kind: "ielts", say: "I prefer reading technical blogs to novels.",
    ok: (o) => o.includes("?") },
];
const dailyScenarios: Scenario[] = [
  { kind: "daily", say: "Hi, can we practice ordering food at a restaurant?",
    ok: (o) => has(o, "order") && o.length < 400 },
  { kind: "daily", say: "Excuse me, how can I get to the nearest subway station?",
    ok: (o) => o.length > 20 && /[A-Za-z]/.test(o) },
  { kind: "daily", say: "Could you tell me about campus life for a first-year student?",
    ok: (o) => /[A-Za-z]/.test(o) && !/[\u4e00-\u9fff]/.test(o) },
  { kind: "daily", say: "I study electrical and mechanical engineering. What vocabulary should I know?",
    ok: (o) => /[A-Za-z]/.test(o) },
  { kind: "daily", say: "I am planning my weekend. I might work on a smart car competition. What do you think?",
    ok: (o) => /[A-Za-z]/.test(o) },
  { kind: "daily", say: "I need to buy a replacement battery for my multimeter.",
    ok: (o) => /[A-Za-z]/.test(o) },
  { kind: "daily", say: "I feel a bit tired and I have a slight headache. Any advice?",
    ok: (o) => has(o, "rest") || has(o, "sleep") || has(o, "water") },
  { kind: "daily", say: "I joined the university intelligent car team this semester.",
    ok: (o) => /[A-Za-z]/.test(o) },
  { kind: "daily", say: "The weather is very humid in Guangzhou lately, isn't it?",
    ok: (o) => /[A-Za-z]/.test(o) },
  { kind: "daily", say: "Thanks for practicing with me today.",
    ok: (o) => /[A-Za-z]/.test(o) },
];
const SCENARIOS = [...dailyScenarios, ...correctionScenarios, ...ieltsScenarios];

function mirrorAppConfig(): webllm.AppConfig {
  const cfg = webllm.prebuiltAppConfig;
  const rec = cfg.model_list.find((r) => r.model_id === MODEL_ID)!;
  // 经主进程代理上游（绕开 CORS；生产形态=模型商店下载哈希校验后本地 serve）
  const hfPath = rec.model.replace("https://huggingface.co/", "");
  const libPath = rec.model_lib.replace(webllm.modelLibURLPrefix, "");
  const mirrored: webllm.ModelRecord = {
    ...rec,
    model: "app://app/__webllm__/hf/" + hfPath,
    model_lib: "app://app/__webllm__/lib/" + libPath,
  };
  return { model_list: [mirrored], cacheBackend: "indexeddb" };
}

async function ask(engine: webllm.MLCEngine, history: webllm.ChatCompletionMessageParam[],
  signal?: AbortSignal): Promise<{ out: string; firstMs: number; totalMs: number }> {
  const t0 = performance.now();
  let firstMs = 0;
  let out = "";
  const chunks = await engine.chatCompletion({
    messages: history, stream: true, temperature: 0.6, max_tokens: 256,
  } as webllm.ChatCompletionRequestStreaming);
  for await (const chunk of chunks as AsyncIterable<webllm.ChatCompletionChunk>) {
    const d = chunk.choices[0]?.delta?.content;
    if (d) {
      if (!firstMs) firstMs = performance.now() - t0;
      out += d;
    }
    if (signal?.aborted) break;
  }
  return { out, firstMs, totalMs: performance.now() - t0 };
}

export async function run() {
  // 1. WebGPU
  const nav = navigator as unknown as { gpu?: { requestAdapter(): Promise<{ info?: { vendor: string; architecture: string; device: string } } | null> } };
  const gpu = nav.gpu;
  log("webgpu " + (gpu ? "present" : "ABSENT"));
  if (gpu) {
    const adapter = await gpu.requestAdapter();
    if (adapter?.info) log(`adapter ${adapter.info.vendor} ${adapter.info.architecture} ${adapter.info.device}`);
  }

  // 2. 加载模型（冷启动；含下载）
  let lastPct = -1;
  const tLoad = performance.now();
  const engine = await webllm.CreateMLCEngine(MODEL_ID, {
    appConfig: mirrorAppConfig(),
    initProgressCallback: (p) => { if (p.progress !== lastPct) { lastPct = p.progress; log("load " + p.progress + "% " + p.text); } },
  });
  log(`coldload_ms ${Math.round(performance.now() - tLoad)}`);

  // 3. 20 场景（多轮历史累积，模拟真实对话）
  const history: webllm.ChatCompletionMessageParam[] = [{ role: "system", content: SYSTEM }];
  const first: number[] = [], total: number[] = [];
  let qualityPass = 0;
  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i];
    history.push({ role: "user", content: sc.say });
    const r = await ask(engine, history);
    first.push(r.firstMs); total.push(r.totalMs);
    const ok = sc.ok(r.out);
    if (ok) qualityPass++;
    log(`scenario ${i + 1} ${sc.kind} ${ok ? "PASS" : "FAIL"} firstMs=${Math.round(r.firstMs)} totalMs=${Math.round(r.totalMs)}`);
    if (!ok) log(`  say="${sc.say}" out="${r.out.replace(/\s+/g, " ").slice(0, 220)}"`);
    history.push({ role: "assistant", content: r.out });
  }
  const pct = (arr: number[], p: number) => {
    const a = [...arr].sort((x, y) => x - y);
    return Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))]);
  };
  log(`quality ${qualityPass}/${SCENARIOS.length}`);
  log(`firstToken p50=${pct(first, 0.5)} p95=${pct(first, 0.95)}`);
  log(`turnTotal p50=${pct(total, 0.5)} p95=${pct(total, 0.95)}`);

  // 4. 打断演练：长回答中途 interruptGenerate（三段独立计时）
  const interruptDrill = async () => {
    const longHist: webllm.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM },
      { role: "user", content: "Tell me a very long, detailed story about a little robot, at least 300 words." },
    ];
    const job = engine.chatCompletion({
      messages: longHist, stream: true, max_tokens: 600,
    } as webllm.ChatCompletionRequestStreaming) as Promise<AsyncIterable<webllm.ChatCompletionChunk>>;
    const chunks = await job;
    let partial = "";
    const it = chunks[Symbol.asyncIterator]();
    const readP = (async () => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const r = await it.next();
        if (r.done) break;
        const d = r.value.choices[0]?.delta?.content;
        if (d) partial += d;
      }
    })();
    await new Promise((r) => setTimeout(r, 700));
    // ① 调用 interruptGenerate() → Promise 返回
    const tCall = performance.now();
    await engine.interruptGenerate();
    const callMs = performance.now() - tCall;
    // ② 调用 → 生成迭代器完全结束
    const tIter = performance.now();
    await readP.catch(() => {});
    const iterEndMs = performance.now() - tIter;
    log(`interrupt partialChars=${partial.length} callResolveMs=${Math.round(callMs)} iterEndMs=${Math.round(iterEndMs)}`);
    // ③ 打断后 → 下一请求可用（首 token 返回即视为系统恢复）
    const tNext = performance.now();
    const after = await ask(engine, [{ role: "system", content: SYSTEM }, { role: "user", content: "Hello, are you still there?" }]);
    log(`afterInterrupt works=${/[A-Za-z]/.test(after.out)} nextUsableMs=${Math.round(performance.now() - tNext)} firstMs=${Math.round(after.firstMs)}`);
  };
  await interruptDrill();
  if (SPIKE_MODE === "interrupt") { log("DONE"); return; }

  // 5. SRI fail-deny：错误哈希必须抛错（onFailure 强制 error）
  {
    const bad = mirrorAppConfig();
    bad.model_list[0] = {
      ...bad.model_list[0],
      integrity: { config: "sha256-" + "A".repeat(44), onFailure: "error" },
    };
    let threw = false;
    try {
      await webllm.CreateMLCEngine(MODEL_ID, { appConfig: bad });
    } catch { threw = true; }
    log(`sriFailDeny ${threw ? "PASS" : "FAIL"}`);
  }

  // 6. 隔离测试：每条纠错/雅思场景用全新历史（区分"指令遵循弱"与"上下文溢出"）
  {
    const focused = [...correctionScenarios, ...ieltsScenarios];
    let freshPass = 0;
    for (let i = 0; i < focused.length; i++) {
      const sc = focused[i];
      const h: webllm.ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM }, { role: "user", content: sc.say },
      ];
      const r = await ask(engine, h);
      const ok = sc.ok(r.out);
      if (ok) freshPass++;
      log(`fresh ${i + 1} ${sc.kind} ${ok ? "PASS" : "FAIL"}`);
      if (!ok) log(`  out="${r.out.replace(/\s+/g, " ").slice(0, 200)}"`);
    }
    log(`freshQuality ${freshPass}/${focused.length}`);
  }

  // 7. 短多轮连续对话：观察从第几轮开始退化（短回复，模拟真实使用）
  {
    const turns = [
      "Hi!", "How are you?", "What do you think of my major, electrical engineering?",
      "I joined the intelligent car team.", "We use a TC264 microcontroller.",
      "It is quite hard for beginners.", "Any advice for practice?", "Thanks!",
    ];
    const h: webllm.ChatCompletionMessageParam[] = [{ role: "system", content: SYSTEM }];
    for (let i = 0; i < turns.length; i++) {
      h.push({ role: "user", content: turns[i] });
      const r = await ask(engine, h);
      const degenerate = /you might need to learn about/i.test(r.out);
      log(`multiturn ${i + 1} ${degenerate ? "DEGENERATE" : "ok"} len=${r.out.length}`);
      h.push({ role: "assistant", content: r.out });
    }
  }

  log("DONE");
}
