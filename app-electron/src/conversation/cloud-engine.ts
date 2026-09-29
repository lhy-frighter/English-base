// V8-4 云端对话引擎：OpenAI 兼容 SSE 流式；与 LocalConversationEngine 同构。
// 配置（端点/模型/key）由云端设置提供；打断用 AbortController，AbortError 静默收口。
// 免费档（glm-4.7-flash）高峰常返 429/1305：内置有限退避重试；关闭思考模式降低首 token 延迟。
import type { Msg } from "./provider";
import { api } from "../api";
import { parseSSEStream, type StreamChunk } from "./cloud-sse";

export type { StreamChunk };

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1200, 2800];

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }
  });
}

export class CloudConversationEngine {
  private controller: AbortController | null = null;
  private interrupted = false;
  modelId = "";

  // 云端无加载态，调用即就绪
  isLoaded(): boolean {
    return true;
  }

  private async postSSE(
    url: string,
    key: string,
    model: string,
    messages: Msg[],
    opts?: { temperature?: number; maxTokens?: number },
  ): Promise<Response> {
    let lastStatus = 0;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (this.controller?.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts?.temperature ?? 0.7,
          max_tokens: opts?.maxTokens ?? 256,
          stream: true,
          // 日常对话不需要深度思考：关闭以降低首 token 延迟（需要时可在后续版本开放开关）
          thinking: { type: "disabled" },
        }),
        signal: this.controller!.signal,
      });
      if (resp.ok) return resp;
      lastStatus = resp.status;
      // 消费错误体，释放连接
      await resp.text().catch(() => "");
      if (!RETRY_STATUS.has(resp.status) || attempt === RETRY_DELAYS_MS.length) break;
      await sleep(RETRY_DELAYS_MS[attempt], this.controller!.signal);
    }
    const err = new Error(`cloud_http_${lastStatus}`);
    (err as Error & { cloudStatus?: number }).cloudStatus = lastStatus;
    throw err;
  }

  async *stream(
    messages: Msg[],
    opts?: { temperature?: number; maxTokens?: number },
  ): AsyncGenerator<StreamChunk> {
    const { consent } = await api.cloudGetConsent();
    const baseUrl = (consent.baseUrl || "").trim();
    const model = (consent.model || "").trim();
    if (!baseUrl) throw new Error("cloud_endpoint_missing");
    if (!model) throw new Error("cloud_model_missing");
    const key = (await api.cloudGetKey()).trim();
    if (!key) throw new Error("cloud_key_missing");
    const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
    this.interrupted = false;
    this.controller = new AbortController();
    let resp: Response;
    try {
      resp = await this.postSSE(url, key, model, messages, opts);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      throw e;
    }
    if (!resp.body) {
      throw new Error(`cloud_http_${resp.status}: empty stream`);
    }
    this.modelId = model;
    try {
      yield* parseSSEStream(resp.body);
    } catch (e) {
      if (this.interrupted && (e as Error).name === "AbortError") return;
      throw e;
    }
  }

  // 短任务：把英文句子快速译成中文（非流式，用于「转为练习」自动填释义）
  async quickTranslate(text: string): Promise<string> {
    const { consent } = await api.cloudGetConsent();
    const baseUrl = (consent.baseUrl || "").trim();
    const model = (consent.model || "").trim();
    const key = (await api.cloudGetKey()).trim();
    if (!baseUrl || !model || !key) throw new Error("cloud_unavailable");
    const resp = await fetch(baseUrl.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, stream: false,
        messages: [
          { role: "system", content: "Translate the user's English into natural Chinese. Output ONLY the translation, no quotes and no notes." },
          { role: "user", content: text },
        ],
        temperature: 0.1, max_tokens: 200, thinking: { type: "disabled" },
      }),
    });
    if (!resp.ok) throw new Error("cloud_http_" + resp.status);
    const j = await resp.json();
    return String(j?.choices?.[0]?.message?.content ?? "").trim();
  }

  interrupt(): void {
    this.interrupted = true;
    this.controller?.abort();
  }

  // 与本地引擎同构的释放（云端无本地资源）
  async unload(): Promise<void> {
    this.interrupt();
    this.controller = null;
  }
}
