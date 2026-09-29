// V8-2a 本地对话引擎：模型商店为唯一权威，WebLLM 只做推理。
// 流程：ensure（模型商店逐文件校验）→ modelRuntime 拿本地 URL → 构造本地 AppConfig
//      → 清理 IndexedDB 中失效条目（旧代理 URL / 已删除或旧 revision 的条目）→ CreateMLCEngine。
import * as webllm from "@mlc-ai/web-llm";
import { api } from "../api";

// WebLLM prebuilt id → 模型商店两个条目（权重 + wasm lib）
const STORE_ID: Record<string, { model: string; lib: string }> = {
  "Qwen2.5-3B-Instruct-q4f16_1-MLC": { model: "webllm-qwen25-3b-f16", lib: "webllm-lib-cs1k" },
  "Qwen2.5-3B-Instruct-q4f32_1-MLC": { model: "webllm-qwen25-3b", lib: "webllm-lib-cs1k" },
  "Qwen2.5-1.5B-Instruct-q4f32_1-MLC": { model: "webllm-qwen25-15b", lib: "webllm-lib-cs1k" },
};

export const DEFAULT_LOCAL_MODEL = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
export const LOW_SPEC_LOCAL_MODEL = "Qwen2.5-1.5B-Instruct-q4f32_1-MLC";

type Runtime = { base: string; repo: string; revision: string; files: string[] };

function runtimePrefix(rt: Runtime) {
  return `${rt.base}/${rt.repo}/resolve/${rt.revision}/`;
}

function buildLocalAppConfig(webllmId: string, modelRt: Runtime, libRt: Runtime): webllm.AppConfig {
  const prebuilt = webllm.prebuiltAppConfig.model_list.find((r) => r.model_id === webllmId);
  if (!prebuilt) throw new Error("WebLLM 内置清单缺少模型: " + webllmId);
  const libFile = prebuilt.model_lib.split("/").pop();
  const localRec: webllm.ModelRecord = {
    ...prebuilt,
    model: runtimePrefix(modelRt),
    model_lib: runtimePrefix(libRt) + libFile,
  };
  return { model_list: [localRec], cacheBackend: "indexeddb" };
}

// 清理 IndexedDB：删除旧 spike 代理 URL 与不属于任何已安装模型的条目。
// WebLLM 三个 DB（tvmjs 权重、webllm/config、webllm/wasm），store 'urls'，keyPath 'url'。
async function pruneStaleCache(allowedPrefixes: string[]): Promise<number> {
  const dbNames = ["tvmjs", "webllm/config", "webllm/wasm"];
  let removed = 0;
  const isStale = (url: string) => {
    if (url.startsWith("app://app/__webllm__/")) return true; // spike 时代的代理 URL
    if (url.startsWith("app://app/__model__/")) return !allowedPrefixes.some((p) => url.startsWith(p));
    return false;
  };
  for (const name of dbNames) {
    const db: IDBDatabase = await new Promise((resolve) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null as unknown as IDBDatabase); // DB 不存在
      req.onupgradeneeded = () => req.transaction?.abort();
    });
    if (!db) continue;
    await new Promise<void>((resolve) => {
      const tx = db.transaction("urls", "readwrite");
      const store = tx.objectStore("urls");
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) { return; }
        const url = String((cursor.value as { url?: string }).url || "");
        if (isStale(url)) { removed++; cursor.delete(); }
        cursor.continue();
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  }
  return removed;
}

export class LocalConversationEngine {
  private engine: webllm.MLCEngine | null = null;
  private loadedId: string | null = null;

  isLoaded(id: string) {
    return this.engine !== null && this.loadedId === id;
  }

  async load(webllmId: string, onProgress?: (p: unknown) => void, opts?: { useWebWorker?: boolean }): Promise<void> {
    const storeIds = STORE_ID[webllmId];
    if (!storeIds) throw new Error("未登记的本地模型: " + webllmId);
    // 模型商店：逐文件校验（已装则零网络），未装则下载
    await api.modelEnsure(storeIds.model);
    await api.modelEnsure(storeIds.lib);
    const modelRt = (await api.modelRuntime(storeIds.model)) as unknown as Runtime;
    const libRt = (await api.modelRuntime(storeIds.lib)) as unknown as Runtime;
    // 已安装 webllm 模型的本地前缀（用于缓存保留判定）
    const catalog = await api.modelCatalog();
    const allowed: string[] = [];
    for (const item of catalog) {
      if (item.state !== "installed") continue;
      const mapping = Object.entries(STORE_ID).find(([, v]) => v.model === item.id);
      if (mapping) {
        try {
          const rt = (await api.modelRuntime(item.id)) as unknown as Runtime;
          allowed.push(runtimePrefix(rt));
        } catch { /* 校验不过的不加入白名单 */ }
      }
    }
    allowed.push(runtimePrefix(({ base: libRt.base, repo: libRt.repo, revision: libRt.revision, files: [] })));
    const removed = await pruneStaleCache(allowed);
    const appConfig = buildLocalAppConfig(webllmId, modelRt, libRt);
    this.engine = await webllm.CreateMLCEngine(webllmId, {
      appConfig,
      ...(opts?.useWebWorker === false ? { useWebWorker: false } : {}),
      initProgressCallback: (p) => onProgress?.(p),
    });
    this.loadedId = webllmId;
    if (removed > 0) console.log("local-engine pruned stale cache entries:", removed);
  }

  async *stream(messages: webllm.ChatCompletionMessageParam[], opts?: {
    temperature?: number; maxTokens?: number;
  }): AsyncGenerator<{ delta: string; text: string }> {
    if (!this.engine) throw new Error("引擎未加载");
    const chunks = await this.engine.chatCompletion({
      messages, stream: true,
      temperature: opts?.temperature ?? 0.6,
      max_tokens: opts?.maxTokens ?? 256,
    } as webllm.ChatCompletionRequestStreaming);
    let text = "";
    for await (const chunk of chunks as AsyncIterable<webllm.ChatCompletionChunk>) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) { text += delta; yield { delta, text }; }
    }
  }

  interrupt(): void {
    this.engine?.interruptGenerate();
  }

  // 释放引擎与 WebGPU 资源（离开语音会话时由 coordinator 调用）
  async unload(): Promise<void> {
    if (!this.engine) return;
    try {
      await this.engine.unload();
    } finally {
      this.engine = null;
      this.loadedId = null;
    }
  }
}
