# ADR-4 · 离线翻译引擎选型：Bergamot 锁定、Opus-MT 否决（2026-09-17，条件通过转正式）

## 背景

v2.6 起阅读链路暴露翻译缺口：`core.cjs` 的 `transForText()` 只对内置素材返回译文，URL/PDF/粘贴导入的文章没有任何机器翻译，"中译"开关对它们无效。产品目标是"先脱拐杖、但初期需要拐杖"的离线精读，因此需要一个**本地、离线、可随应用分发、许可证干净**的英→中机器翻译引擎。

约束（沿用 ADR-2/ADR-3 铁律）：

- 禁止原生 Node 模块、禁止无签名 sidecar；运行时只能是浏览器标准能力 + WASM/Web Worker
- 许可证必须支持 AGPL 开源版与未来商业桌面发行
- 在线翻译 API（DeepL/Google/大模型）留到 Phase 2 用户自带 key，不进本地默认链路

2026-09-17 完成限时 spike（工程 `app-electron/spike-v8/`，详见《S7a 离线翻译引擎 Spike 报告》），对两个候选在同一 60 段冻结集（ScienceDaily / Aeon / News in Levels 各 20 段）上做了下载、工程打通、性能与人工比较。

## 候选复核结论（2026-09-17）

| 维度 | Bergamot（Mozilla/Firefox 现产栈） | Opus-MT（Helsinki-NLP，Xenova ONNX q8） |
|---|---|---|
| 模型 | en→zh base-memory，Release 条目，2024 finetune，int8，43.5M 参数 | 2020 Marian 6 层，q8 编码器+解码器 |
| 体积 | 模型 47.6 MiB + 引擎 WASM 5.2 MiB | ~120 MB（encoder 52.9 + decoder 60.2 + tokenizer 6.4） |
| 许可证 | 引擎与模型均 **MPL-2.0**（文件级弱 copyleft，合规义务见裁决 #7） | 权重 **Apache-2.0**（已核实模型卡，纠正旧 CC-BY-4.0 说法） |
| 运行形态 | 纯 JS+WASM，无 .node/sidecar；npm 0.4.9 原始胶水已内置 createWasmGemm，**无需打补丁**（早期 wasm_gemm 补丁路线报 LinkError，已证伪） | transformers.js 直连；Node 下仅 onnxruntime-node 原生 EP，渲染进程 WASM 未测 |
| 速度（本机） | 365–530 词/秒；首段 232 ms；冷启动 133 ms | 33–60 词/秒（CPU EP）；首段 546 ms；约慢 8–10 倍 |
| 内存 | WASM 线性内存首译后固定 687.3 MB（不回落）；RSS 约 550–596 MB | RSS 峰值约 731 MB |
| 质量（人工 60 段） | 0 空译、0 整句漏译、0 增译；好 30/小疵 18/中疵 10/重错 2；NIL 近生产级；长文主旨全保留、措辞生硬 | **重复退化 4–5 段、静默漏句 4 段**；tokenizer 把 Průša 切成 "Pr, ša" |
| 盲评（20 项，A/B 身份逐项随机、投票先于揭盲） | **胜 15** | 胜 3、平 2（`blind-votes.json`/`blind-key.json`/`blind-score.json` 可审计） |
| 术语 | 通用新闻模型，CS/古生物术语系统性误译（transformer→变压器、Cretaceous→白癜风） | 同样误译，无差异优势 |

其他候选（记录不重测）：NLLB 为 CC-BY-NC 禁商用；Argos/LibreTranslate 是 Python+CTranslate2 原生 sidecar，违反 ADR-3；Web Speech API 不做翻译。

## 决策

### 1. 锁定 Bergamot 为本地默认英→中引擎（裁决 #1，通过）

- 引擎：`@browsermt/bergamot-translator@0.4.9`（MPL-2.0），包内仅 JS/WASM
- 模型版本**固定**为 spike 验证过的当前四个文件（字节数与 SHA256 以 `spike-v8/model-manifest.json` 为准，已与 GCS 注册表逐字节一致）：model.enzh.intgemm.alphas.bin（43,849,787 B，sha 前缀 4e5accc14137）、lex.50.50.enzh.s2t.bin（4,485,184 B，8575d8daa10e）、srcvocab.enzh.spm（806,952 B，bd9b65504acc）、trgvocab.enzh.spm（772,004 B，aded6993c36e）
- **GCS 注册表只用于发现新版本，不是动态指针**：产品不会自动跟随 Release 轮换；Mozilla 更新模型后，必须在冻结集上重新评测、更新本 ADR 与可信清单才能换版
- 模型商店沿用 ASR 的可信清单→staging→全量校验→原子切换→可回滚流程；镜像可配置（GCS 广州实测可达；商业发行默认走自控国内对象存储，不硬编码第三方镜像）

### 2. Opus-MT 否决（裁决 #2，通过）

质量否决，与许可证无关：重复退化与静默漏句在无人值守的阅读场景不可接受（用户不会逐句核对译文，漏句会直接造成理解缺失）；且体积 2.5 倍、速度慢一个数量级。Apache-2.0 的许可优势不足以翻盘。若未来 Bergamot 模型注册表政策变化或 MPL 合规出现障碍，Opus 系（或更新的 Helsinki 模型）作为备选重新评测，门槛是同冻结集 0 退化、0 漏句。

### 3. 推理运行时租约：统一 InferenceCoordinator 强制互斥（裁决 #3，P0 修正后通过）

"阅读页与跟读页页面互斥"不构成 Worker 生命周期互斥——ASR 是模块级单例，切离跟读页不会自动 dispose。因此**必须**实现统一的推理运行时协调器：

- `acquire("translation")` 前先销毁 ASR Worker 并等待其退出确认；`acquire("asr")` 前先销毁翻译 Worker
- 切换过程串行化（同一把锁），禁止两个页面并发抢占；租约引用计数，同能力内多页面共享
- Worker 懒加载；空闲超时销毁只是第二层保险，不能替代 acquire/release
- 翻译 Worker 内 WASM 运行时只初始化一次；切换模型只重建 model/service，不二次 eval 胶水；请求带唯一 id、串行 busy 队列、fatal 后完整重置
- **真机验收闸门（S7b 前）**：Electron 内 ASR→翻译→ASR 完整走一遍，逐阶段确认旧 Worker 进程级退出、WASM 线性内存释放、RSS 回落到基线区间
- 渲染进程接入时复验 npm 0.4.9 WASM 是否单线程：单线程则无需 SharedArrayBuffer/COOP-COEP（比 Whisper 简单）；若为 pthread 版则沿用 ADR-3 裁决 #3 的按能力隔离方案

### 4. 译文定位为"参考拐杖"，术语层与 MT 并存（裁决 #4，通过）

- 两个引擎共同证明：通用模型对领域术语系统性误译（transformer、self-attention、Cretaceous、angiosperm 等）。UI 必须把机翻标注为参考，不做权威呈现
- 领域术语由本地分层词库/领域词包（S1/S2 已建机制，S8 继续扩展）承担：MT 译文与词库释义并列，不互相覆盖
- 保真边界写入验收：数字与专名抽检、引号对称、换行保留；spike 发现 1/53 数字笔误与开引号丢失，S7b 需有抽检脚本而非信任输出

### 5. S7b 生产接入形态（裁决 #5，通过，含三项开工闸门）

- **HTML 实体处理收窄为强制项，不保留二选一**：当前阅读库保存的是纯文本，必须在**导入/翻译边界统一解码实体**——命名实体（`&amp; &lt; &gt; &agrave; …`）、十进制（`&#8217;`）、十六进制（`&#x2019;`），并防重复解码；测试逐项覆盖。引擎 html 模式留给未来真正含标记的输入，本期不启用
- 按段渐进翻译（用户当前阅读段落优先），可取消、可重试；长文按句/批切分（max-length-break 128）喂入再拼接
- 缓存用独立 migration v10：`text_translations(text_id, para_index, source_sha256, src_lang, dst_lang, engine, model_revision, translated_text, pairs_json, status, updated_at)`；source_sha256+model_revision 自动失效；段落是展示/进度单位
- **句对/对齐闸门**：spike 评测请求实际传的是 `alignment:false`，仅证明 yaml 配置可加载，**没有验证对齐输出**。S7b 必须先端到端验证 Bergamot 响应中的句对能支撑划选"参考译文"返回对应片段；验证失败则走确定性英文分句→逐句翻译→段落聚合的兜底，pairs_json 按兜底结构存储
- 翻译能力对所有来源文章（URL/PDF/粘贴/好文）统一开放，替换 `transForText()` 只服务 builtins 的现状
- **S7b 开工前三闸门**：①Electron 渲染 Worker（线程模型 + 687MB 线性内存/实际 RSS 复测）；②句对提取端到端验证；③裁决 #3 的 ASR↔翻译租约切换真机验收；外加断网/磁盘不足下载故障注入

### 6. 在线通道留口（裁决 #6，通过）

Phase 2 允许用户配置自带 key 的在线翻译（大模型/DeepL 类）作为可选高质量通道；本地 Bergamot 是默认且唯一开箱通道。不在 v1 周期实现。

### 7. MPL-2.0 合规交付物（裁决 #7，正式化收窄）

"补丁独立存放即满足披露义务"的说法过满。发行物（含 AGPL 开源版与未来商业包）必须齐备：

- THIRD_PARTY_NOTICES：列明 Bergamot 引擎（名称、版本 0.4.9、上游获取地址、MPL-2.0）与 Mozilla 翻译模型（模型标识、注册表/下载地址、MPL-2.0）
- MPL-2.0 许可证全文（已归档 `spike-v8/licenses/`，vendor 目录带 LICENSE.txt/NOTICE.txt）
- **引擎 MPL 文件保持原样、不打补丁**（0.4.9 胶水自带 createWasmGemm，见候选表）；我方封装 `vendor/bergamot/translator-worker.js` 是独立自有文件（importScripts 自举），不修改 copyleft 文件本身；上游原始 worker 留档 `upstream-translator-worker.js`，发行说明写清版本与获取地址即可
- MPL 为文件级 copyleft：若未来确需修改引擎文件，修改须可获取源码并附可复现构建说明；与应用自有代码以独立文件形式并存即合规，不传染自有代码。商业发行前由发行清单逐项核对

## S7a 闸门执行记录（2026-09-17，工程 `app-electron/spike-v8/`）

- 模型：4 文件下载+gunzip+SHA256 与 GCS 注册表逐字节核对通过（用户复验一致）；引擎 npm 包解压确认纯 JS/WASM 无 .node（用户复验一致）
- 工程：补丁后冒烟 3 句通过；Worker 冷启动/首段/60 段批量/reinit 确定性/terminate 取消/死代理断网重启全部通过
- 性能：见上表（明细 `bergamot-result.json`、`opus-result.json`）
- 内存：用户独立复跑——加载后 WASM 71.9MB/RSS 165.8MB，首译后 WASM 687.3MB/RSS 550.9MB，60 段后 RSS 575.7MB，GC 不回落；支持"固定高水位、非逐段泄漏"
- 质量：人工 60 段（`bergamot-review.json` 计数已统一为 30/18/10/2、`opus-review.json`）；盲评 v2 真随机身份、投票先于揭盲（`blind-AB.txt`/`blind-votes.json`/`blind-key.json`/`tally-blind.cjs`/`blind-score.json`），Bergamot 15:3:2
- 许可证：引擎与模型 MPL-2.0 全文归档
- 未覆盖（即 S7b 前三闸门）：真实 Electron 渲染进程 Worker 线程模型与内存；句对/对齐端到端；ASR↔翻译租约切换 RSS 验收；断网/磁盘不足下载故障注入

## S7b 闸门执行记录（2026-09-17，全部 PASS）

- **闸门①渲染 Worker（线程/内存）**：`GATE-1-2-REPORT.md`。翻译 Worker 为单线程 WASM，不依赖 SharedArrayBuffer/COOP-COEP（iso 与非 iso 页面均成功）；init 214–236 ms、首译 ~330 ms、稳态 345–352 词/秒、0 空译；RSS 90→201→618→643 MB 封顶，terminate 后回落到 103–106 MB（租约释放可回收约 530 MB）
- **闸门②句对提取**：embind 无 getAlignments，句对由 `getSourceSentence/getTranslatedSentence` 的 {begin,end} 字符区间切片得到；越界抛错、引擎会合并短句（个别源句 tgt 为空串），生产层 `normalizePairs` 对空 tgt 回落到上一译句/整段译文；划选匹配限定同英文段落，端点落中文段落拒绝
- **闸门③-a 模型可信下载**（`gate-gcs-download.cjs`/`.json`）：广州真实 GCS 四文件 gz 下载 15.3 s，解压后字节数与 SHA256 全部与可信清单一致；二次运行零网络；断网注入（指向 127.0.0.1:1）6.0 s 干净失败、无 manifest 无 active；模型已装入真机库，用户首次使用免下载
- **闸门③-b ASR↔翻译租约切换**（`gate3.cjs`/`gate3.json`，用生产 coordinator+asr+translator 源码构建）：10 项判定全过。RSS 实测（MB）：基线 89 → ASR(whisper-base) 986 → 翻译 689（ASR 已退出，而非叠加到 ~1.6 GB）→ 切回 ASR 1058（翻译已退出）→ 双释放 177；功能面：两程 ASR 静音转写均返回、12 段翻译 582 ms 0 空译、acquire 标志位证明旧 Worker 先 dispose、三个并发 acquire 严格按 mt→asr→mt 串行
- 结论：三项开工闸门与下载故障注入全部通过，ADR-4 由"条件通过"转**正式**，S7b 生产代码封板

## 后果

- 正面：翻译能力可覆盖全部导入来源；47.6 MB 模型 + 5.2 MB 引擎的分发成本可接受；365+ 词/秒使按段即点即译无等待；MPL-2.0 与 AGPL/商业路径在履行裁决 #7 后兼容
- 代价/风险：①Chromium 无 Firefox 优化 GEMM，fallback 实现下单线程 365–530 词/秒够用，超长文后台批量仍需排队；②687 MB WASM 线性内存要求租约协调器到位，否则与 ASR 并存会顶高内存；③通用模型术语误译是永久性边界，靠词库分层与 UI 措辞缓解，不能靠换模型消灭；④MPL-2.0 合规交付物必须随发行维护
- 后续顺序：**S6 书库卡片化（已放行）**（migration v9 `text_sources` + 全文 CEFR 接进 annotateAndSave + listTexts 分页/排序/来源/统计 + 卡片网格）→ S7b 按段翻译与缓存（migration v10，本 ADR 裁决 #5，过三闸门后开工）→ S8 词库扩展（Morphy 屈折→Open English WordNet，CC-BY-4.0+Princeton WordNet License 双署名→Wiktionary 后置）

## 状态

正式。用户 2026-09-17 裁决：Bergamot 锁定、Opus-MT 否决；盲评可审计性（v2 真随机，15:3:2）与推理互斥（InferenceCoordinator + 闸门③真机证据）两项 P0 已闭合；S6 已完成，S7b 三闸门 2026-09-17 全部 PASS，生产代码封板。
