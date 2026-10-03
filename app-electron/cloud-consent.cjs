// V8-2d 云端同意约定：三类数据各自独立开关，默认全关（不自动发送）。
// 本地失败不得自动联网兜底；云端发送必须由用户逐项显式授权。
// V8-4：默认端点/模型预填智谱 BigModel（开关仍全关，不产生任何请求）。
const DEFAULT_CONSENT = Object.freeze({
  profile: false, // 学习画像
  historyText: false, // 历史对话文本
  audio: false, // 录音原文
  grammarCloud: false, // 文本送云端做语法深度分析（S15-1）
  topicClassify: false, // 好文标题+摘要送云端做题材分类（#208）
  baseUrl: "https://open.bigmodel.cn/api/paas/v4/", // OpenAI 兼容端点
  model: "glm-4.7-flash", // 云端模型名
  updatedAt: 0,
});

function normalizeConsent(c) {
  return {
    profile: !!c?.profile,
    historyText: !!c?.historyText,
    audio: !!c?.audio,
    grammarCloud: !!c?.grammarCloud,
    topicClassify: !!c?.topicClassify,
    baseUrl: String(c?.baseUrl ?? DEFAULT_CONSENT.baseUrl).slice(0, 300),
    model: String(c?.model ?? DEFAULT_CONSENT.model).slice(0, 120),
    updatedAt: Date.now(),
  };
}

// 解析 app_settings 中的 cloud_consent_json；损坏或缺失回默认（绝不抛错）。
function parseConsent(raw) {
  if (!raw) return { ...DEFAULT_CONSENT };
  try {
    return { ...DEFAULT_CONSENT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONSENT };
  }
}

module.exports = { DEFAULT_CONSENT, normalizeConsent, parseConsent };
