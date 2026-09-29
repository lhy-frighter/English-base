// V8-2a 断网冷启动冒烟：全程禁止 app:// 以外的任何网络请求，
// 从模型商店已校验版本加载 3B 并完成一轮对话。任一外网请求 → FATAL。
import { LocalConversationEngine, DEFAULT_LOCAL_MODEL } from "../conversation/local-engine";

function log(line: string) {
  console.log(line);
}

(async () => {
  // 网络守卫：在引擎创建前装好（useWebWorker:false，全部 fetch 都经主线程，可被审计）
  let externalAttempts = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!/^app:\/\//.test(url)) {
      externalAttempts++;
      log("V8OFF external_fetch_blocked " + url);
      return Promise.reject(new Error("offline smoke: external fetch blocked: " + url));
    }
    return origFetch(input, init);
  };
  globalThis.WebSocket = function (url: string | URL) {
    externalAttempts++;
    log("V8OFF external_ws_blocked " + String(url));
    throw new Error("offline smoke: external websocket blocked");
  } as unknown as typeof WebSocket;

  try {
    // —— DoD#2 缓存失效验收：种入 stale（旧代理 URL）+ fresh（当前已安装前缀）条目 ——
    const modelPrefix3b = "app://app/__model__/mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC/resolve/7690aaaa46df36b1be0fe93b9c9abac0497eff6c/";
    const seedEntries: Record<string, { stale: string; fresh: string }> = {
      "tvmjs": { stale: "app://app/__webllm__/hf/mlc-ai/x/params_shard_0.bin", fresh: modelPrefix3b + "prune-test-keep.bin" },
      "webllm/config": { stale: "app://app/__webllm__/hf/mlc-ai/x/mlc-chat-config.json", fresh: modelPrefix3b + "prune-test-keep.json" },
      "webllm/wasm": { stale: "app://app/__webllm__/lib/old.wasm", fresh: "app://app/__model__/mlc-ai/binary-mlc-llm-libs/resolve/v0_2_84-base/prune-test-keep.wasm" },
    };
    async function idbPut(dbName: string, url: string) {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onupgradeneeded = () => req.result.createObjectStore("urls", { keyPath: "url" });
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("urls", "readwrite");
          tx.objectStore("urls").put({ url, data: new Uint8Array(4) });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        req.onerror = () => reject(req.error);
      });
    }
    async function idbHas(dbName: string, url: string): Promise<boolean> {
      return new Promise((resolve) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("urls", "readonly");
          const g = tx.objectStore("urls").get(url);
          g.onsuccess = () => { db.close(); resolve(!!g.result); };
          g.onerror = () => { db.close(); resolve(false); };
        };
        req.onerror = () => resolve(false);
      });
    }
    for (const [dbName, urls] of Object.entries(seedEntries)) {
      await idbPut(dbName, urls.stale);
      await idbPut(dbName, urls.fresh);
    }
    log("V8OFF prune_seeded");

    const engine = new LocalConversationEngine();
    let lastPct = -1;
    await engine.load(
      DEFAULT_LOCAL_MODEL,
      (p: unknown) => {
        const pct = Math.round((p as { progress?: number }).progress || 0);
        if (pct >= lastPct + 10) { lastPct = pct; log("V8OFF load_pct " + pct); }
      },
      { useWebWorker: false },
    );
    log("V8OFF engine_loaded");
    let reply = "";
    const stream = engine.stream(
      [
        { role: "system", content: "You are a helpful English tutor. Keep replies short." },
        { role: "user", content: "In one sentence, what is the past tense of 'go'?" },
      ],
      { maxTokens: 64 },
    );
    for await (const chunk of stream) reply = chunk.text;
    log("V8OFF reply_len " + reply.length + " reply " + JSON.stringify(reply.slice(0, 120)));
    if (externalAttempts > 0) { log("V8OFF FATAL external attempts=" + externalAttempts); return; }
    if (reply.trim().length < 5) { log("V8OFF FATAL empty reply"); return; }
    let pruneOk = true;
    for (const [dbName, urls] of Object.entries(seedEntries)) {
      const staleGone = !(await idbHas(dbName, urls.stale));
      const freshKept = await idbHas(dbName, urls.fresh);
      log("V8OFF prune " + dbName + " stale_gone=" + staleGone + " fresh_kept=" + freshKept);
      if (!staleGone || !freshKept) pruneOk = false;
    }
    if (!pruneOk) { log("V8OFF FATAL cache prune check failed"); return; }
    log("V8OFF DONE");
  } catch (e) {
    log("V8OFF FATAL " + (e as Error).message);
  }
})();
