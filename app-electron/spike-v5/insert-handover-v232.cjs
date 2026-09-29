const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const entry = [
`> 更新：2026-09-23 · 版本 v2.32.0（**V8-2a：模型商店接入 WebLLM 文件清单与可信下载**）`,
`> - **TRUSTED_CATALOG 从 4 条目扩到 7 条目**（model-store.cjs）：新增 webllm-lib-cs1k（wasm 运行时）、webllm-qwen25-3b、webllm-qwen25-15b；全部固定 commit、逐文件预置 bytes+SHA256。`,
`>   - webllm-lib-cs1k：repo mlc-ai/binary-mlc-llm-libs，revision v0_2_84-base，新增 transport "jsdelivr"（fileUrl 取 cdnUrl、强制 HTTPS），2 个 cs1k wasm（3B 5,297,311B / 1.5B 5,106,483B）。`,
`>   - webllm-qwen25-3b：repo mlc-ai/Qwen2.5-3B-Instruct-q4f32_1-MLC，revision dfa91e85（固定），67 文件（mlc-chat-config/tokenizer.json/tokenizer_config/ndarray-cache/tensor-cache + 62 shard）。`,
`>   - webllm-qwen25-15b：repo mlc-ai/Qwen2.5-1.5B-Instruct-q4f32_1-MLC，revision a822ee41（固定），35 文件（同上 4 静态 + 30 shard）。`,
`>   - 过程发现：WebLLM 加载时除 ndarray-cache.json 还请求 tensor-cache.json（内容不同，已按固定 revision 下载并补入清单：3B 164,965B sha fee95d8a、1.5B 124,489B sha b166155d）。`,
`> - **新增生产模块 src/conversation/local-engine.ts**：LocalConversationEngine——load() 先经模型商店 ensure（权重+wasm 两条目）与 modelRuntime（verifyActive 零网络），构造指向 app://__model__ 本地文件的 AppConfig（cacheBackend 'indexeddb'），pruneStaleCache 清理三 IDB（tvmjs/webllm config/webllm wasm）中旧代理 URL 与非已安装前缀条目，再 CreateMLCEngine（支持 stream/interrupt、useWebWorker 选项）。导出 DEFAULT_LOCAL_MODEL（3B）、LOW_SPEC_LOCAL_MODEL（1.5B）。`,
`> - **DoD 四条全部验证**：`,
`>   1. 逐文件校验：verifyActive 对 config/tokenizer/wasm/全部 shard 深校验，三新条目全 true（model-catalog 链 53 checks）。`,
`>   2. 缓存失效：离线冒烟在三 IDB 种入 stale（旧 __webllm__ 代理 URL）+ fresh（当前已安装前缀）条目，load 后 stale 全清、fresh 全留——即 revision 变化/删模型时旧缓存被强制失效。`,
`>   3. 断网冷启动：新增 harness（APP_V8_OFFLINE_SMOKE，?offline=v8，src/spike-v8/offline-smoke.ts；fetch 守卫仅放行 app://、WebSocket 直接拒绝、useWebWorker:false 全链路可审计），实测零外网请求，3B 离线加载并正确回答 "The past tense of 'go' is 'went'."，**V8OFF DONE**。`,
`>   4. 摘要不覆盖学习事实：主要落 #123（V8-2c），本地引擎数据层已按"原始轮次为事实源"设计，窗口按 token 预算并为输出预留空间。`,
`> - **验证**：全量 npm test 零失败（39 链；model-store 链新增 J1 jsdelivr 用例、model-catalog 更新为 7 条目/53 checks）；tsc=0；vite build=0；node -c main.cjs 通过。三个新条目已安装（用生成器已下载文件走 staging→commit 正式路径，verifyActive 哈希全过，未重复下载）。`,
`> - 辅助产物（不进分发）：spike-v5/ 下 list-webllm-repo、gen-webllm-catalog、add-tensor-cache、seed-install 等脚本；webllm-catalog.generated.json（逐文件 sha 权威）；gen-webllm/ 原始文件；data/webllm-lib-cache 两 wasm。`,
`> - 下一步：#122 V8-2b 文字对话 UI 与轮次状态机接线（话题目标/CEFR/建议轮数/逐轮轻纠错/结束总结、七态+turn_key 幂等）；#123 V8-2c token 预算滑窗+摘要；#124 V8-2d 云端显式同意三开关+safeStorage。`,
``,
].join("\r\n");
const anchor = "# 个人英语能力底座 · 交接文档\r\n";
if (!s.startsWith(anchor)) { console.error("header anchor missing"); process.exit(1); }
s = anchor + entry + s.slice(anchor.length);
fs.writeFileSync(p, s);
console.log("v2.32.0 handover entry inserted");
