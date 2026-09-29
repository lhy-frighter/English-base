const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");

const anchor = "# 个人英语能力底座 · 交接文档\r\n";
if (!s.includes(anchor)) throw new Error("handoff title anchor missing");

const lines = [
  "> 更新：2026-09-24 · 版本 v2.38.0（**V8-4 云端优先 · 本地/云端引擎可切换 #131–#134**）",
  "> - **架构修订（ADR-6 2026-09-24 修订）**：默认引擎由本地 3B 改为**云端 GLM-4.7-Flash**——无冷启动、不占 ~2.5GB VRAM，纠错/语法分析质量显著更高；本地引擎保留为断网/隐私/开源发行可选。产品护城河重述为「个人语言资产闭环」，模型为可替换引擎；商业化云端成本须计入订阅或 BYOK。",
  "> - **#132 云端引擎 + 模型字段**：",
  ">   - `cloud-consent.cjs`：DEFAULT_CONSENT 预填 baseUrl `https://open.bigmodel.cn/api/paas/v4/`、model `glm-4.7-flash`（开关仍全关）；normalizeConsent 加 model（截断 120），缺省（undefined）合并默认、显式空串保留；parseConsent 旧 JSON 缺 model 自动补默认。",
  ">   - 新模块 `src/conversation/cloud-sse.ts`：SSE 解析纯函数 parseSSEStream（data 事件增量拼接、[DONE] 截断、坏 JSON/心跳忽略、流结束冲刷尾部无空行事件）。",
  ">   - 新模块 `src/conversation/cloud-engine.ts`：CloudConversationEngine——isLoaded 恒真、async *stream 与本地引擎同构（OpenAI 兼容 POST /chat/completions、Bearer key、SSE），AbortController 打断、AbortError 静默收口，modelId 记录实际模型。",
  ">   - `main.cjs` 新增 cloudGetKey IPC（safeStorage DPAPI 解密返回明文，无 key 返回空串）；preload 暴露；api.ts 加 cloudGetKey 与 CloudConsent.model。",
  "> - **#133 切换 UI 与接线**：设置页「开始新对话」顶部加引擎分段（云端 GLM / 本地 3B）；聊天 header 加云端/本地分段（busy 时禁用）；云端设置卡片加**模型名输入框**（与端点/key 同卡），卡片文案改为「云端为默认引擎、失败不自动兜底」。send：云端前置校验 historyText 授权与 key，云端发送前 release(\"llm\") 卸载本地大脑，assistant 轮 provider/modelRevision 按实际引擎；失败气泡下加「云端重试 / 切本地重试」（复用失败轮不新增轮次）。ensureEngine 先 acquire(\"llm\")；打断作用于当前引擎。",
  "> - **#134 测试**：新链 `test/cloud-sse.ts`（6 checks，strip-types，已加入 npm test）；cloud-settings 扩到 19 checks（默认端点/模型、旧 JSON 补 model、超长截断）。全量 **npm test 零失败（43 链）**；tsc=0；vite build=0；main/cloud-consent 语法通过。",
  "> - **待用户真机闸门（只能本人）**：①云端一轮：勾选 historyText + key 已存 → 发消息无冷启动即回复、AI 出声；②header 切本地一轮正常；③云端失败（如断网/错 key）气泡出现重试条，「切本地重试」不新增轮次；④云端→本地切换时任务管理器看本地模型重新加载、反之本地→云端看显存/RSS 回落。",
  "> - **下一步（待裁决）**：V8-VAD（Silero 常开麦自动断句，免手按流畅对话）；云端发音/语法深度分析；ASR 封板剩余真机闸门仍挂账。",
  ">",
];
const block = lines.join("\r\n") + "\r\n";
s = s.replace(anchor, anchor + block);
fs.writeFileSync(p, s);
console.log("v2.38.0 handoff inserted");
