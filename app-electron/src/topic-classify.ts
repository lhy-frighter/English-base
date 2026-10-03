// src/topic-classify.ts — 好文题材分类（#208）
//
// 三条约束来自 grill-me 定案：
//   1) **固定题材集**，不让模型自由发挥。自由输出会生成「科技/科技资讯/技术/科技新闻」
//      这类近义类，分区越跑越碎、永远收敛不了。
//   2) **手动触发**。不挂在抓取链上——否则每次刷新推荐都发请求，消耗不可控。
//   3) 只送标题+摘要（公开 RSS 元数据），不送任何学习数据。
//
// 纯逻辑、无网络，提示词构造与结果解析都可单测；真正发请求在 topic-classify-cloud.ts。

/** 固定题材集。顺序即展示顺序，不要随意增删——增删会让历史标注失去意义。 */
export const TOPICS = [
  { id: "tech", label: "科技", desc: "技术、产品、AI、互联网" },
  { id: "business", label: "商业", desc: "公司、市场、经济、职场" },
  { id: "science", label: "科学", desc: "研究、医学、气候、物理生物" },
  { id: "society", label: "社科", desc: "历史、政治、教育、社会议题" },
  { id: "culture", label: "文化", desc: "艺术、影视、文学、出版" },
  { id: "life", label: "生活", desc: "健康、饮食、旅行、家庭、情感" },
  { id: "opinion", label: "观点", desc: "评论、专栏、观点论证" },
] as const;

export type TopicId = typeof TOPICS[number]["id"] | "other";
export const TOPIC_IDS: readonly string[] = [...TOPICS.map((t) => t.id), "other"];

export function topicLabel(id: string): string {
  if (id === "other") return "其他";
  return TOPICS.find((t) => t.id === id)?.label || "其他";
}

export interface ClassifyInput {
  guid: string;
  title: string;
  summary: string;
}

export interface ClassifyResult {
  guid: string;
  topic: TopicId;
  /** 一句话中文提要（≤40 字），分区卡片上显示 */
  gist: string;
}

/** 单次请求的批量条数。太小则请求次数多，太大则单条出错的连带影响大。 */
export const BATCH_SIZE = 12;

/** 摘要截断长度：够模型判断题材，又不至于把整篇塞进去。 */
const SUMMARY_CAP = 320;

export function buildPrompt(batch: ClassifyInput[]): string {
  const list = batch.map((it, i) => {
    const sum = String(it.summary || "").replace(/\s+/g, " ").trim().slice(0, SUMMARY_CAP);
    return `${i + 1}. 标题：${String(it.title || "").slice(0, 120)}\n   摘要：${sum || "（无）"}`;
  }).join("\n");
  return [
    "给下列英文文章各标注一个题材。只从给定选项里选，不要自创。",
    "",
    "可选题材：",
    ...TOPICS.map((t) => `- ${t.id}（${t.label}）：${t.desc}`),
    "- other：都不像",
    "",
    "判定要点：",
    "- 同一篇文章只给一个最贴切的题材，不要多标",
    "- 观点/评论类（作者在论证、表达立场）归 opinion，即使话题是科技或社科",
    "- 纯资讯（报道事实、引用数据）按内容领域归类",
    "",
    "严格输出 JSON，不要任何额外文字：",
    '{"results":[{"i":1,"topic":"tech","gist":"一句话中文提要，40字内"}]}',
    "",
    "文章列表：",
    list,
  ].join("\n");
}

/** 解析模型返回。容错：字段缺失、越界、JSON 包裹 markdown 代码块都要能救回来。 */
export function parseReply(raw: string, batch: ClassifyInput[]): ClassifyResult[] {
  const out: ClassifyResult[] = [];
  let obj: unknown = null;
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  try { obj = JSON.parse(body); }
  catch {
    const m = body.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch { obj = null; } }
  }
  const rows = (obj as { results?: unknown })?.results;
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const idx = Number((r as { i?: unknown }).i);
    const item = batch[idx - 1];
    if (!item) continue;
    const t = String((r as { topic?: unknown }).topic || "").trim();
    const gist = String((r as { gist?: unknown }).gist || "").replace(/\s+/g, " ").trim().slice(0, 60);
    out.push({
      guid: item.guid,
      // 越界 topic 一律降级 other，不让脏数据进分区
      topic: (TOPIC_IDS.includes(t) ? t : "other") as TopicId,
      gist,
    });
  }
  return out;
}

/** 把一批切成请求批次。 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}