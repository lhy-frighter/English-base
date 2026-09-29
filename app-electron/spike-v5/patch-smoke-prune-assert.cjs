const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/spike-v8/offline-smoke.ts";
let s = fs.readFileSync(p, "utf8");

// 在 try 块开头（engine 创建前）插入 IDB 种子与验收
const a = `  try {
    const engine = new LocalConversationEngine();`;
const b = `  try {
    // —— DoD#2 缓存失效验收：种入 stale（旧代理 URL）+ fresh（当前已安装前缀）条目 ——
    const modelPrefix3b = "app://app/__model__/mlc-ai/Qwen2.5-3B-Instruct-q4f32_1-MLC/resolve/dfa91e859b714acfa489a1464297080656c3460d/";
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

    const engine = new LocalConversationEngine();`;
if (!s.includes(a)) { console.error("seed anchor missing"); process.exit(1); }
s = s.replace(a, b);

// 在 DONE 前插入 prune 验收
const a2 = `    if (reply.trim().length < 5) { log("V8OFF FATAL empty reply"); return; }
    log("V8OFF DONE");`;
const b2 = `    if (reply.trim().length < 5) { log("V8OFF FATAL empty reply"); return; }
    let pruneOk = true;
    for (const [dbName, urls] of Object.entries(seedEntries)) {
      const staleGone = !(await idbHas(dbName, urls.stale));
      const freshKept = await idbHas(dbName, urls.fresh);
      log("V8OFF prune " + dbName + " stale_gone=" + staleGone + " fresh_kept=" + freshKept);
      if (!staleGone || !freshKept) pruneOk = false;
    }
    if (!pruneOk) { log("V8OFF FATAL cache prune check failed"); return; }
    log("V8OFF DONE");`;
if (!s.includes(a2)) { console.error("done anchor missing"); process.exit(1); }
s = s.replace(a2, b2);

fs.writeFileSync(p, s);
console.log("prune assertions added to offline smoke");
