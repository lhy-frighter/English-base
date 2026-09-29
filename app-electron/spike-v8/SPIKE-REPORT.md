# S7a 离线翻译引擎 Spike 报告（Bergamot vs Opus-MT）

- 日期：2026-09-17
- 范围：只做模型下载、Worker 推理、60 段冻结集评测，**不接生产库、不改生产代码**
- 产物目录：`app-electron/spike-v8/`
- 结论先行：**建议 ADR-4 锁定 Bergamot（Firefox 现产 en→zh base-memory 模型 + @browsermt/bergamot-translator 0.4.9 WASM）**；Opus-MT 否决

---

## 1. 评测对象（均为当前正式版本，非记忆中的旧版本）

### Bergamot（Mozilla Firefox 同款本地翻译栈）

- 事实源（每日生成的注册表）：`https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json`
- en→zh 正式条目：`releaseStatus: "Release"`、`architecture: "base-memory"`（非 Release 的 base 条目不采用；不写死 "v2.2" 之类版本号）
- 模型文件（gunzip 后实测，`model-manifest.json`）：

| 文件 | 字节 | SHA256（前 12 位） |
|---|---:|---|
| model.enzh.intgemm.alphas.bin | 43,849,787 | 4e5accc14137 |
| lex.50.50.enzh.s2t.bin | 4,485,184 | 8575d8daa10e |
| srcvocab.enzh.spm | 806,952 | bd9b65504acc |
| trgvocab.enzh.spm | 772,004 | aded6993c36e |
| **合计** | **49,913,927（47.6 MiB）** | |

- model 的 size 与 SHA256 与注册表逐字节一致（verifiedAgainstRegistry=true）；桶内 metadata.json 记录 marian v1.12.14、43,536,965 参数、int8 GEMM
- 注册表指标（FLORES200+）：comet22=0.8628、spbleu=34.34、chrf++=24.88、metricx24=1.978。"距 Google COMET 5%"是 Mozilla 的**发布准入线**，不是对我们三类文本的质量保证
- 引擎：npm `@browsermt/bergamot-translator@0.4.9`，包内只有 JS + 5.17 MiB WASM，**无 .node、无 sidecar**
- 许可证：引擎与 Mozilla 模型仓库均为 **MPL-2.0**（LICENSE 已归档到 `licenses/`）。MPL 是文件级弱 copyleft：我们对引擎文件的修改（见下"必须打补丁"）以独立 patch 文件+脚本形式存在，天然满足披露义务，与 AGPL/商业桌面发行兼容

### Opus-MT（对照）

- `Xenova/opus-mt-en-zh`（transformers.js 官方转换，基线 `Helsinki-NLP/opus-mt-en-zh`）
- 权重许可证实测为 **Apache-2.0**（HF 模型卡 tag `license:apache-2.0`，纠正此前 CC-BY-4.0 的说法）
- q8 产物：encoder 52.9 MB + decoder_merged 60.2 MB + tokenizer.json 6.4 MB ≈ **120 MB**
- 原仓无 ONNX，Xenova 转换仓存在且可直接被 transformers.js 加载（此前"105MB、工程最省"的估计基本属实）

## 2. 工程打通记录（Bergamot）

1. npm 包不能直接 eval：胶水报 `Import #26 module="wasm_gemm": module is not an object or function`。必须按上游 `patch-artifacts-import-gemm-module.sh` 给 worker 胶水注入 `wasm_gemm`（`patch-gemm.cjs` + `import-gemm-module.js`）。Chromium/Electron 无 Firefox 专有的 `WebAssembly.mozIntGemm`，自动走 fallback GEMM（启动打印 "Using fallback gemm implementation"）
2. split vocab：srcvocab/trgvocab 两个都要 push 进 AlignedMemoryList（顺序 src→trg），shortlist alignment 64、model 256
3. Worker 形态用 `worker_threads` 模拟 Web Worker 生命周期（terminate==kill）。踩坑：**WASM 胶水在同一 JS 上下文不能二次 eval**（onRuntimeInitialized 不再触发）；正确做法是 runtime 只初始化一次，reinit 只重建 model/service（`bergamot-worker.cjs` 已按此实现）
4. 推理配置：beam-size 1、gemm-precision int8shiftAll、max-length-break 128、mini-batch-words 1024、workspace 128、alignment soft、html 选项可保留标签
5. 运行期零网络：死代理环境（HTTPS_PROXY=127.0.0.1:9）下新 Worker 照常翻译；模型全部本地文件

## 3. 性能（同一台机器，Node 22，fallback GEMM）

| 指标 | Bergamot | Opus-MT（q8，CPU EP*） |
|---|---:|---:|
| 磁盘体积（模型+引擎/tokenizer） | 47.6 MB + 5.2 MB | ~120 MB（复用已装 transformers.js） |
| 冷启动（Worker spawn→可译） | 133 ms | 611 ms（热缓存）/ 63 s（含下载） |
| 首段延迟 | 232 ms | 546 ms |
| News in Levels（394 词） | 933 ms，422 词/秒 | 7,214 ms，55 词/秒 |
| ScienceDaily（749 词） | 2,052 ms，365 词/秒 | 22,569 ms，33 词/秒 |
| Aeon（2,298 词） | 4,623 ms，497 词/秒 | 38,142 ms，60 词/秒 |
| 内存：加载后 / 峰值 RSS | 132 MB / 596 MB | 411 MB / 731 MB |

\* transformers.js 在 Node 下只有 onnxruntime-node（dml/cpu），WASM EP 只存在于浏览器构建；Opus 的 WASM 渲染进程性能未测（Whisper 已在本应用证明 WASM renderer 路径可行，计算图与 EP 无关），但自回归解码器在 WASM 下只会更慢，不改变排序。

Bergamot 内存细节（`diag-heap`/`diag-config-sweep`，2026-09-17 审查方复跑一致）：**两个指标不要混淆**——WASM 线性内存（Module.heap 等）加载后 71.9 MB、**首次翻译后固定增长到 687.3 MB 且 GC 后不回落**；进程实际 RSS 加载后约 166 MB、首译后约 551 MB、60 段后约 576 MB（不同测量轮次峰值 550–596 MB）。687 MB 是 WASM 线性内存规模，不等于 RSS。workspace/mini-batch 调小都不改变该高水位，是 int8 准备权重+工作区的固定成本，不是泄漏、与批量大小无关。产品含义：翻译 Worker 懒加载、空闲销毁，**且不与 ASR Worker 同时驻留**（由 ADR-4 裁决 #3 的推理运行时租约强制保证，页面互斥本身不够）。

生命周期测试：连续 60 段无失败；reinit 后同批次译文逐字节一致（确定性=true；注意单句调用与批量调用在 int8 批处理下可能有极微差异，属正常）；大批次中 terminate() 22ms 取消、主线程存活；断网重启正常。

## 4. 译文质量（60 段冻结集，人工逐段 + 20 段盲评）

冻结集：`fixtures/frozen-paragraphs.json`（评测开始后不得换样本）：ScienceDaily 20 段（真机库 text #8）、Aeon 20 段（text #6）、News in Levels L2 两篇故事各 10 段。

### Bergamot（明细 `bergamot-review.json`）

- 0 段空译、0 段整句漏译、0 段增译；53 处数字中 46 处原样保留（其余为合理本地化，如 125 million→1.25亿），仅 1 处真实数字笔误（项目编号 007903→00793）；换行保留
- News in Levels（B1-B2）：18 好 / 2 小疵，基本可直接用
- ScienceDaily：10 好 / 4 小疵 / 4 中疵 / 2 重错。重错全是术语：Cretaceous→白癜风、angiosperm→血管精子（应：白垩纪、被子植物）；holotype、caudal fin、karstic 等也错
- Aeon（C1 文学性长文）：2 好 / 12 小疵 / 6 中疵 / 0 重错。每段主旨都在、年代数字专名基本保留，但生硬措辞和散点词义错误较多（convictions→定罪、jalopies→军犬、car-less→无家可归者）
- 合计：**好 30 / 小疵 18 / 中疵 10 / 重错 2（按类汇总，和为 60）**
- 冒烟阶段 CS 句同样系统性误译：transformer→变压器、self-attention→自理机制

### Opus-MT（明细 `opus-review.json`）——存在不可接受的硬伤

- **重复退化 4-5 段**：sciencedaily-08 出现约 600 字"长长的长/短的短"死循环、aeon-08 句首"路路路路…"、aeon-02"高速高速高速…"（且 1928→998 丢数字）、aeon-17 整句重复
- **静默漏句 4 段**：sciencedaily-07/10/17、newsinlevels-07 各丢失首句或引文主句
- tokenizer 缺陷实证：`Průša` 被切成 `Pr, ša`（加载时官方已警告 MarianTokenizer 快分词支持不完整）
- **盲评（v2，可审计）**：20 段分层抽样，**A/B 身份逐项随机分配**（不再是只换显示顺序），判定先写入 `blind-votes.json` 后才打开 `blind-key.json` 揭盲，揭盲脚本 `tally-blind.cjs`、结果 `blind-score.json`：**Bergamot 胜 15、Opus 胜 3、平 2**。Opus 的 3 胜为：item 7（双方术语同错时完整性略好）、item 17/19（个别短句更自然/更克制）
- Opus 仅有的两处系统性更好：car-less 译对（无汽车者）、个别短句更自然；不改变结论

### 两者共同弱点（不是选型能解决的）

术语/专名系统性薄弱、HTML 实体（`&agrave;` 等）原样穿透导致人名损坏。这两条直接决定 S7b/S8 的配套设计：**译文定位为"参考拐杖"而非权威**；翻译前必须做 HTML 实体解码（或直接用 html 模式保留标签）；领域词包/本地词典作为术语层与 MT 并存。

## 5. 对 S7b（按段渐进翻译+缓存）的输入

1. 引擎按模型商店既有模式分发：可信清单预置字节数+SHA256、staging→校验→原子切换、可配置镜像（GCS 在广州实测可达，但不硬编码，商业发行走自控对象存储）
2. 独立翻译 Worker（与 ASR Worker 同等级别的生命周期管理：懒加载、空闲销毁、错误重置）
3. migration v10 `text_translations(text_id, para_index, source_sha256, src_lang, dst_lang, engine, model_revision, translated_text, pairs_json, status, updated_at)` 按用户既定 schema；source_sha256+model_revision 做失效；段落是展示/进度单位，内部保留句对（alignment soft 已可用），否则划选"参考译文"只能给整段
4. 输入预处理（裁决后收窄为强制项）：当前阅读库保存的是纯文本，**必须在导入/翻译边界统一解码 HTML 实体**（命名实体 `&amp; &lt; &gt; &agrave; …`、十进制 `&#8217;`、十六进制 `&#x2019;`，含重复解码防护，测试逐项覆盖）；引擎 html 模式留给未来真正含标记的输入，本期不启用。长文按句切分（≤约 200 词/批）喂入再拼接；翻译请求串行排队（Worker 内已加 busy 守卫）
5. **句对/对齐是 S7b 待验证闸门，不是已验证能力**：spike 评测请求实际传的是 `alignment:false`（仅 yaml 里加载了 `alignment: soft`，没有产出、消费过对齐数据）。S7b 必须先端到端验证响应对齐能产出划选所需句对；验证失败则走确定性英文分句→逐句翻译→段落聚合的兜底路径
6. 渲染进程集成时需复验：npm 0.4.9 的 WASM 是否单线程（若是则不需要 SharedArrayBuffer/COOP-COEP，比 Whisper 简单；若加载 pthread 版则沿用 ADR-3 的隔离方案），并在 Electron Worker 内复测内存高水位
7. **模型版本固定**：当前四文件哈希即锁定版本（`model-manifest.json`）；注册表只用于发现新版本，Mozilla 轮换模型后必须人工复评并修订 ADR，不自动跟随
8. **推理运行时互斥**：ASR 与翻译不允许 Worker 共存（687MB 固定高水位），由统一 InferenceCoordinator 租约强制（详见 ADR-4 裁决 #3）
9. **MPL 合规交付物**：发行物必须带 THIRD_PARTY_NOTICES、MPL-2.0 全文、确切上游版本与源码获取地址、wasm_gemm 补丁与可复现构建说明（"补丁独立"只是其中一环，不构成完整合规）

## 6. 结论

| 维度 | Bergamot | Opus-MT |
|---|---|---|
| 译文质量（盲评） | 胜（15/20，3 负 2 平；真随机身份、投票先于揭盲），无退化/漏句 | 重复退化+漏句，不可无人值守使用 |
| 速度 | 365–530 词/秒 | 33–60 词/秒（约 8–10 倍慢） |
| 体积 | 47.6 MB | ~120 MB |
| 内存峰值 | ~596 MB | ~731 MB |
| 许可证 | MPL-2.0（文件级 copyleft，patch 已独立） | Apache-2.0 |
| 工程 | 需打 1 个已知补丁；纯 WASM | transformers.js 直连，但 Node 无 WASM EP |

**ADR-4（2026-09-17 用户条件通过）：Bergamot 锁定，Opus-MT 否决**。Opus-MT 不进入产品（其 Apache-2.0 许可优势不足以抵消质量/速度/体积差距，MPL-2.0 对本项目的 AGPL 开源+桌面发行路径不构成障碍）。S7b 开工前三闸门：Electron 渲染 Worker（线程模型+内存）、句对/对齐提取、ASR↔翻译运行时租约切换（含 RSS 回落真机验收）。
