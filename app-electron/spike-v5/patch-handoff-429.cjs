const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const anchor = ">   - 新模块 `src/conversation/cloud-engine.ts`：CloudConversationEngine——isLoaded 恒真、async *stream 与本地引擎同构（OpenAI 兼容 POST /chat/completions、Bearer key、SSE），AbortController 打断、AbortError 静默收口，modelId 记录实际模型。\r\n";
if (!s.includes(anchor)) throw new Error("handoff cloud-engine bullet anchor missing");
const add = ">   - **免费档 429/1305 硬化**：postSSE 对 429/5xx 做 2 次退避重试（1.2s/2.8s）；请求体加 `thinking:{type:\"disabled\"}` 关闭深度思考、降低首 token 延迟；失败气泡错误码人话化（429→云端模型繁忙、401→key 无效）。真机冒烟 3 次：2 次秒回（\"Hi there! How is your day going...\"）、1 次 429（重试可吸收）。\r\n";
s = s.replace(anchor, anchor + add);
fs.writeFileSync(p, s);
console.log("handoff hardening note added");
