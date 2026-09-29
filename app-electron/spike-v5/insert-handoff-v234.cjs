const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const anchor = "# 个人英语能力底座 · 交接文档" + nl;
if (!s.startsWith(anchor)) throw new Error("header anchor missing");
const entry = [
"> 更新：2026-09-24 · 版本 v2.34.0（**#125：默认本地大脑量化档 q4f32→q4f16，删除旧档**）",
"> - **起因**：用户体感对话加载占用资源过多，且每次回复只需几句话。调研结论（WebLLM prebuilt 数据）：q4f32_1 = 4 位权重 + FP32 计算（最吃资源的 4-bit 档）；MLC 默认推荐 **q4f16_1 = 4 位权重 + FP16 计算**，质量基本无损、显存更省。实测显存 3B：2893.64→2504.76MB（省约 389MB）；1.5B：1888.97→1629.75MB。cs1k 短上下文与 maxTokens 220 已把 KV/输出开销压到最小。",
"> - **TRUSTED_CATALOG 从 7 条目扩到 8 条目**（model-store.cjs，新条目插在 f32 3B 之前）：",
">   - 新增 `webllm-qwen25-3b-f16`：repo mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC，固定 revision `7690aaaa46df36b1be0fe93b9c9abac0497eff6c`，dtype q4f16，67 文件（mlc-chat-config/tokenizer.json/tokenizer_config/ndarray-cache/tensor-cache + 62 shard），totalBytes 1,743,558,832（与 f32 相同，shard 尺寸一致），Apache-2.0。",
">   - webllm-lib-cs1k 增加第 3 个 wasm：Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm（5,438,957B，sha256 bae8a6d2…bd40305a）。",
"> - **local-engine.ts**：STORE_ID 加 f16 映射并置顶（f32 3B、1.5B f32 映射保留以便再下载）；DEFAULT_LOCAL_MODEL 改为 \"Qwen2.5-3B-Instruct-q4f16_1-MLC\"；runtime.ts 的 CURRENT_MODEL 自动跟随。",
"> - **安装与清理**：f16 权重 + lib（3 wasm）经 staging→commit 正式安装，verifyActive 全 true；按用户要求删除旧 f32 3B 安装文件（activeDir + manifest + stage/part 残留，catalog 条目保留、status 回到 missing，需要时可再下载）；1.5B f32 低配档保留。生成器中间文件（gen-webllm 三份、webllm-lib-cache）已清理。",
"> - **f16 断网冷启动冒烟重跑通过**（offline-smoke.ts 的 fresh 前缀同步改为 f16 路径）：零外网请求，f16 离线加载并正确回答 \"The past tense of 'go' is 'went'.\"，缓存 stale 清/fresh 留全过，V8OFF DONE。注：首次冷启动需把 1.6GB 写入 IDB，耗时较长属正常，之后走缓存。",
"> - **验证**：全量 npm test 零失败（**40 链**；model-catalog 改 8 条目/61 checks：lib 3 wasm、f16 commit 7690aaaa/62 shard/约 1.6GB）；tsc=0；vite build=0；node -c main.cjs/core.cjs/model-store.cjs 通过。",
"> - **待用户真机闸门**：对话页 f16 加载进度、回复质量与 f32 体感对比、显存/资源占用体感。",
"> - 下一步：#123 V8-2c token 预算滑窗+摘要；#124 V8-2d 云端显式同意三开关+safeStorage；V8-3 语音全链路（五段延迟、LLM 租约、played_char_end）。",
].join(nl) + nl;
s = anchor + entry + s.slice(anchor.length);
fs.writeFileSync(p, s);
console.log("handoff v2.34.0 inserted");
