# ADR-5 本地神经 TTS 选型：Kokoro-82M 自用版条件通过、商业版阻塞（2026-09-18，限时 spike 裁决）

## 背景

跟读台"🔈听示范"与单词卡发音原走 Web Speech API（Windows SAPI 本地语音）：整段塞进单个 utterance、不切分不插静音，用户反馈"没有真人停顿感、一连串机器表达"。V7 真人感语音对话同样需要本地神经 TTS。约束沿用 ADR-2/ADR-3 铁律：禁止原生 Node 模块与无签名 sidecar；浏览器标准能力 + WASM/Web Worker；在线神经 TTS 留 Phase 2 用户自带 key。

2026-09-17～18 完成限时 spike（工程在 `app-electron/spike-v8/`，闸门 `gate-kokoro.cjs` / `gate-k2.cjs` / `gate-lease.cjs`），对 Kokoro-82M 做了下载校验、Electron Worker 推理、性能/内存/租约闸门与 A/B 听音产物。

## 候选复核

| 维度 | Kokoro-82M（hexgrad，onnx-community ONNX） | 对话级神经 TTS（Sesame CSM-1B / Orpheus / Zonos / Chatterbox 等） | Piper | Web Speech/SAPI |
|---|---|---|---|---|
| 体积 | q8 模型 92.4 MB + 单音色 522 KB（全音色约 28.7 MB） | 0.7–8B，需 GPU，本机 WASM 不可行 | 小但音质为"2021 年助手"水平，且同样依赖 espeak（GPL） | 0 下载 |
| 运行 | 纯 JS/WASM（onnxruntime-web 1.22-dev），无 .node/sidecar | 不可行 | sidecar/原生 | 系统内置 |
| 音质 | StyleTTS2，82M，24kHz；v0.19 发布前曾居 TTS Arena 开放权重榜首（非当前排名陈述） | 更高表现力但带不动 | 机械感明显 | 机械感明显（现状） |
| 许可证 | 权重与 kokoro-js 封装均 Apache-2.0；**但 G2P 链路内联 eSpeak NG（GPL-3.0-or-later）** | 多为 Apache/MIT，但不可运行 | espeak GPL + 仓库已归档迁移 | 系统组件 |
| 克隆 | 不支持零样本克隆，固定美/英音色包 | 部分支持 | 否 | — |

## 关键工程发现：kokoro-js 自带 bundle 在本环境挂死，必须用生产 transformers 直连

- `kokoro-js@1.2.1` 的浏览器自足 bundle `kokoro.web.js` 内联 transformers **3.5.1** 与 phonemizer。在 Electron 独立 Worker 内：模型加载（~1s）、tokenizer、音色获取均正常，但 `session.run`（generate_from_ids）**永久挂起、CPU 空闲（死等而非慢）**。已逐一排除：线程数 1/2/8/16/32、crossOriginIsolated 开关、CacheStorage（换 no-op 桩）、wasmBinary 预取与显式 mjs、显式 numThreads、navigator.hardwareConcurrency 封顶。
- 对照实验 `gate-k2.cjs`：改用项目锁定的 **@huggingface/transformers 3.8.1**（与 ASR 同一运行时，本机已验证）直接 `AutoModel/AutoTokenizer/Tensor` 加载同一模型、vendor phonemizer 单独负责音素化，**一次跑通**。
- 裁决：**不使用 kokoro.web.js bundle**（vendor 目录保留作 API 与文本归一化参考；其 bundle 补丁仅为排查产物，不进生产）。生产为自写薄封装 Worker：3.8.1 + vendor `phonemizer@1.2.1`，与 ASR 同一套 env/wasm/线程配置范式。

## 真机闸门结果（Ryzen 9 8945HX 16C32T / Electron 38 / WASM q8 / 8 线程 / 隔离开启）

模型固定：`onnx-community/Kokoro-82M-v1.0-ONNX`，commit `1939ad2a8e416c0acfeecc08a694d14ef25f2231`，音色 af_heart；5 文件字节数与 SHA256 见 `spike-v8/gate-kokoro-download.json`（总计 86,559,479 B）。

| 闸门 | 阈值（评审原文） | 实测 | 结论 |
|---|---|---|---|
| 冷启动/加载 | — | init ~1.0 s，加载后 RSS ~625 MB | 达标 |
| RTF p95 | < 0.8 | 整句稳态 RTF 中位 **0.826**；首句热身离群使 p95=1.106；热身后单块 RTF 中位 0.83 | **未严格达标，条件通过**（见下） |
| 20 词内首音 | ≤ 1.5 s | 整句合成 p50 4.7 s；按标点意群首块 1.0–5.3 s（中位 3.0 s） | **未严格达标，条件通过**（见下） |
| 30 分钟浸泡 | 头尾增长 <100 MB、迭代 ≥30 | 1801 s、**557 次**迭代，RSS 在 576–681 MB 带状波动（头三点均 ~620、尾三点 ~645，+25 MB） | **达标** |
| Worker 销毁回落 | ≤ 基线+150 MB | 基线 75 → 销毁+GC 后 189 MB（+114） | **达标** |
| 三租约互斥 | ASR→TTS→翻译→TTS 不叠加驻留 | gate-lease 11 项判定**全 PASS**：各阶段旧 Worker 已退出、RSS 不叠加、二次 TTS 回到单租约水位、最终回基线 | **达标** |
| 发行洁净 | 无 .node/sidecar | 3.8.1 + phonemizer 均为 JS/WASM；产物未引用 onnxruntime-node/sharp | 达标（生产打包后再做一次发行目录扫描） |

**两个"未严格达标"的处置（条件通过的条件，生产切片必须实现并复测）**：

1. RTF 0.82 仅略慢于实时，逐句串行会追不上播放；必须**分句流式合成 + 排队播放**（合成线程持续领先播放器，0.82× 速度使缓冲缓慢增长而非耗尽）。
2. 首音延迟必须靠两件事压到 1.5 s 量级：① Worker init 后后台**热身合成一次**（吃掉 p95 离群）；② **首块强制切短**（首个合成块不超过约 6 个词，不等第一个逗号），其余块按 `tts-chunks` 意群切分。生产切片上线前用真实播放链路复测"首音延迟"与"队列不耗尽率"，本 ADR 不以整句合成时间冒充该指标。

## 决策

### 1. Kokoro-82M q8 定为自用版本地神经 TTS（裁决 #1，条件通过）
- 模型/音色固定 commit 与 SHA256，走 ASR/翻译同一套可信清单：manifest 预置字节数+哈希、镜像只传输、status/ensure/首次加载全程校验、staging→全量校验→原子切换、可回滚；镜像可用户配置，商业发行走自控对象存储，不硬编码 hf-mirror 为官方可信源。
- 生产为自写 Worker（3.8.1 直连 + vendor phonemizer），与 ASR 同范式：预取 wasmBinary、显式 mjs、numThreads 8（隔离时）/1（非隔离回退）、useBrowserCache=false、no-op/禁用 CacheStorage、请求带 id、fatal 完整 reset。
- 必须移植 kokoro-js 的文本归一化（缩写/数字/符号，spike 直接喂原文，`Dr.`/`3.14`/`U.S.`/`1,000`/`9:15 a.m.` 的读法以听音验收为准），不得跳过。
- 分发音色暂只下载 af_heart（522 KB）；多音色按用户选择按需下载，不预拉全音色包。

### 2. 停顿策略：耳朵裁决选 pauses（裁决 #2，2026-09-18 已定）
- 同一 15 句冻结集的两版 WAV：`kokoro-native.wav`（仅模型原生标点韵律，4.68 MB）与 `kokoro-pauses.wav`（意群切分后再插 190–520 ms 静音，5.47 MB），在 `spike-v8/kokoro-wav/`。
- **0 号用户盲听结论：采用 pauses 版**（意群切分 + 填零的播放管线）。生产播放管线按 `tts-chunks.splitClauses` 意群切分、逐块流式合成，块间按 clause.pause 填零（24 kHz），句间停顿取冻结集参数。
- 说明：两版 WAV 的体积差（约 0.8 MB）纯粹来自插入静音使音频变长，**模型与音色文件完全相同（92.4 MB + 522 KB），不影响安装包体积**；若实测双重停顿，优先缩短逗号级（190 ms）填零，句号/换行级保留。
- 配套 SAPI 兜底调整（v2.9.1）：SAPI 句子改用 `splitSentences`（只在句末/换行断句，逗号保留在同一 utterance 内）——系统语音自身会按逗号做韵律，按逗号切成独立 utterance 会重置句调、听起来像"念清单"；splitClauses 仅 Kokoro 使用。

### 3. InferenceCoordinator 增加第三类租约 "tts"（裁决 #3）
- `InferenceKind` 扩为 `"asr" | "translation" | "tts"`：acquire 任一租约前先销毁其余两方运行时；切换全程在现有串行链上完成；TTS Worker 不做模块级常驻单例，由租约 create/dispose（gate-lease 已证明该序列 RSS 正确）。空闲超时销毁仅作第二层保险。
- SAPI/Web Speech 保留为零下载兜底：模型未安装、下载失败或低端机 RTF 不可接受时自动降级，功能不报废。

### 4. 商业版状态：BLOCKED_BY_G2P_LICENSE（裁决 #4）
- 确定链路（非灰区推测）：`kokoro-js@1.2.1 → phonemizer@1.2.1（封装代码 Apache-2.0）→ 内联 eSpeak NG（GPL-3.0-or-later，wasm 与 espeak-ng-data 内嵌于 phonemizer.js，无网络 fetch，已源码核实）`。自用与 AGPL 开源版可发；**闭源商业版在 G2P 替换前禁止发布该链路**。
- 干净候选（均未验证 JS/WASM 交付链，不得写成"可用"）：官方 Misaki（Apache-2.0，可关 espeak fallback）、misaki-rs/kokoro-cli、floravox-cli（明确关 espeak，生词逐字母读）、kokoro-en crate 的 misaki-lean、@met4citizen/headtts（MIT、无 espeak、带音素时间戳/视位）、@uzen/kokoro-js。转正条件：词典覆盖率/OOV 行为/WASM 构建/许可证清单四项复核。
- sherpa-onnx 的 Kokoro 路径当前同样要求 espeak-ng-data 且其上游已计划 2.0 移除，发布并完成依赖审计后再评估，不能消除本 ADR 的 GPL 判定。

### 5. 合规交付物（裁决 #5）
发行物（含 AGPL 版与未来商业包）须带 THIRD_PARTY_NOTICES：Kokoro 权重（模型卡 Apache-2.0、repo、commit）、kokoro-js/phonemizer（Apache-2.0、版本、获取地址）、**eSpeak NG（GPL-3.0-or-later，AGPL 版的 copyleft 声明与对应源码获取方式）**；vendor 目录保留各自 LICENSE；模型与引擎版本、补丁、可复现构建说明归档。

### 6. 范围与顺序（裁决 #6）
- 本 ADR 只封 spike 结论。生产切片（模型商店注册、tts Worker 模块、流式队列播放、coordinator 第三租约、SAPI 降级、设置页模型管理）在耳朵裁决后单独立片。
- 生产切片完成后**立即回到 S8 词库扩展主线**（Morphy 屈折层 → Open English WordNet → 防假词派生规则 → Wiktionary 后置），音质升级不得继续吞主线。
- V7 语音对话方向：Kokoro 按 LLM 流式分句合成 + 排队播放；高表现力/情感嗓音留 Phase 2 用户自带 key 的云神经 TTS。

## 闸门产物索引
- `spike-v8/gate-kokoro-download.json`：可信清单（5 文件字节数/SHA256）
- `spike-v8/gate-kokoro.json`：15 句两模式指标 + 30 分钟浸泡（557 次）+ RSS 阶段值
- `spike-v8/gate-lease.json`：ASR→TTS→翻译→TTS 三租约 11 项判定（全 PASS）
- `spike-v8/kokoro-wav/kokoro-native.wav`、`kokoro-pauses.wav`：A/B 盲听材料
- `spike-v8/gate-kokoro/{kokoro-worker.ts,k2-worker.ts}`：3.8.1 直连参考实现（生产 Worker 的蓝本）
- `spike-v8/vendor-kokoro/`：kokoro-js 1.2.1 / phonemizer 1.2.1 解包与 LICENSE

## 生产落地状态（2026-09-18，v2.10.0）

- 裁决 #1–#5 已全部按本 ADR 落地：模型商店注册 `kokoro-82m`（固定 commit 1939ad2 + 5 文件 SHA256，总量 92,887,010B，真机镜像下载 20.3s、深校验 5/5）；生产 Worker `src/tts-kokoro/worker.ts`（3.8.1 直连 + vendor phonemizer，jsep WASM，双句热身）；coordinator 第三租约 "tts"；SAPI 零下载兜底；THIRD_PARTY_NOTICES 随发行物落 dist/legal。
- 裁决 #2 pauses 管线落地并补一处工程修正：无逗号长首句被"首块 ≤6 词"硬切时，每块独立合成自带模型句尾静音会在非停顿点产生断层；硬切块（seamless）裁尾静音（阈值 0.012、保留 120ms），标点边界块保留自然尾音 + 190–520ms 填零。tts-chunks 61 断言覆盖。
- **闸门口径修正**：决策节"首音 ≤1.5s"在本机（Ryzen 9 8945HX / WASM q8 / 8 线程 / WebGPU 关闭）达不到——冷 acquire 5.3–5.7s（init+双热身）、热身后 6 词首块 2.8–3.6s，RTF≈1。生产以"复习页进页预热 + 合成/播放流水线预取（后续块 1.2–2.5s 短于首块音频，队列不耗尽）+ 加载状态浮层"掩盖；该 1.5s 指标在 WebGPU 可用机型重测前不得标记达标。
- 生产三租约真机闸门（打包生产 src 的 gate-prod-lease，两轮）15/15 PASS：ASR→TTS→Bergamot→TTS 全序列互斥销毁、RSS 不叠加、最终回落基线、缩写数字归一化不崩、6 段翻译 0 空译；证据 `app-electron/spike-v8/gate-prod-lease.json`。发行目录扫描无 .node/.dll/.exe。
- 商业版状态维持 **BLOCKED_BY_G2P_LICENSE**；干净 G2P 候选转正前不得在闭源包启用本链路。
- 按裁决 #6，生产化完成后回到 S8 词库扩展主线。
