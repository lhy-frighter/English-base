// src/topic-classify-cloud.ts — 题材分类的云端调用（#208）
//
// 只在用户点「整理题材」时调用；每次调用前先查 topicClassify 授权。
// 与翻译批改的分工相同：本地能做的绝不发云端，这里只做「标题+摘要 → 题材」。
import { api } from "./api";
import {
  BATCH_SIZE, buildPrompt, chunk, parseReply,
  type ClassifyInput, type ClassifyResult,
} from "./topic-classify";

export interface ClassifyRunResult {
  ok: boolean;
  reason?: string;
  classified: number;
  results: ClassifyResult[];
}

async function postJson(url: string, key: string, model: string, user: string): Promise<string> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, stream: false, temperature: 0.1, max_tokens: 1600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你是严谨的文章分类器，严格输出 JSON。" },
        { role: "user", content: user },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`cloud_http_${resp.status}`);
  const j = await resp.json();
  return String(j?.choices?.[0]?.message?.content ?? "");
}

/** 对一批未分类条目跑题材标注。逐批发送，某批失败不阻断其余批次。 */
export async function classifyTopics(items: ClassifyInput[]): Promise<ClassifyRunResult> {
  if (items.length === 0) return { ok: true, classified: 0, results: [] };
  const { consent } = await api.cloudGetConsent();
  if (!consent.topicClassify) return { ok: false, reason: "topic_consent_off", classified: 0, results: [] };
  const baseUrl = String(consent.baseUrl || "").replace(/\/+$/, "");
  const model = String(consent.model || "");
  if (!baseUrl || !model) return { ok: false, reason: "cloud_endpoint_missing", classified: 0, results: [] };
  const key = (await api.cloudGetKey()).trim();
  if (!key) return { ok: false, reason: "cloud_key_missing", classified: 0, results: [] };

  const all: ClassifyResult[] = [];
  let failed = 0;
  for (const batch of chunk(items, BATCH_SIZE)) {
    try {
      const raw = await postJson(baseUrl + "/chat/completions", key, model, buildPrompt(batch));
      all.push(...parseReply(raw, batch));
    } catch (e) {
      failed++;
      console.error("[topic] 批次分类失败", e);
    }
  }
  return {
    ok: failed === 0,
    reason: failed ? `${failed} 批失败` : undefined,
    classified: all.length,
    results: all,
  };
}

export function classifyErrorText(reason: string): string {
  switch (reason) {
    case "topic_consent_off": return "未开启「好文题材分类」授权（设置 → 云端授权）";
    case "cloud_endpoint_missing": return "未配置云端端点或模型（设置 → 云端端点与模型）";
    case "cloud_key_missing": return "未配置 API Key（设置 → API Key）";
    default: return "分类失败：" + reason;
  }
}