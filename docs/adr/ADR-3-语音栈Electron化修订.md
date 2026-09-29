# ADR-3 · 语音栈 Electron 化修订：原生链路 → 独立 Worker 内 WASM/WebGPU（2026-09-14）

## 背景

方案 v1.6 §19/§22 的语音栈按 ADR-1 的 Rust/Tauri 架构选定：cpal 采集、silero-vad 经
sherpa-onnx 官方 Rust API、whisper.cpp 原生推理、kokoro-onnx+misaki Python sidecar
（当时认定的商业干净路径）。

ADR-2（2026-09-12）已将运行时切换为 Electron/JS，并立两条铁律：**禁止原生 Node 模块、
禁止重打包 electron.exe**（SAC 拦一切无签名二进制）。原语音栈与铁律正面冲突：
- 无签名 sidecar .exe 与当初杀掉 Tauri 的是同一堵墙；
- sherpa-onnx-node 等 node-addon-api 原生包属于被禁的原生模块；
- cpal 直采在 Electron 里不存在，音频采集必须走 Web 标准 API。

2026-09-14 对 GitHub 候选项目做了实时复核（星数/最近提交/归档状态/许可证/浏览器形态），
本 ADR 记录复核后的选型裁决。

## 候选复核结论（2026-09-14）

**ASR（语音识别）**

| 项目 | 实时状态 | 许可 | 浏览器形态 | 结论 |
|---|---|---|---|---|
| @huggingface/transformers.js + Whisper ONNX | 16.3k★，持续活跃 | Apache-2.0 | WASM 基线 + WebGPU 加速，支持词级时间戳 | **锁定主选（2026-09-16 闸门全过；默认 whisper-base 多语 q8）**（与 TTS 共用 onnxruntime-web 一套运行时） |
| ggml-org/whisper.cpp | 53.7k★，活跃 | MIT | 官方 WASM（需 SIMD，多线程需跨域隔离），原生词级戳成熟 | 备胎：主选 WER/速度不达标时启用 |
| k2-fsa/sherpa-onnx | 14.8k★，活跃 | Apache-2.0（框架） | WASM，ASR/TTS/VAD 一体 | V7 实时流式候选；词级对齐需自做 |
| Moonshine v2（Tiny 34M，WER 12.0%、TTFT 13.5ms，优于 Whisper Tiny 的 12.8%/44ms） | 2024 末新模型 | MIT | ONNX 可跑 | V7 低延迟候选；无 Whisper 式词级时间戳 |
| alphacep/vosk-api | 15.1k★ | Apache-2.0 | WASM | 淘汰：模型与精度落后一代 |

**VAD**：@ricky0123/vad-web（silero-vad ONNX 的 WASM 版，约 2MB）。

**TTS（语音合成）**

| 项目 | 状态 | 许可（含完整链路） | 结论 |
|---|---|---|---|
| kokoro-js（Kokoro-82M，q8 约 90MB） | npm 活跃，**模型权重 Apache-2.0**；但英文 G2P 依赖 espeak-ng 数据（**GPL-3.0 灰区**） | 自用/AGPL 版主力 |
| Web Speech API（Windows SAPI SpeechSynthesis） | 系统自带 | — | 零下载、尽力而为兜底（不保证每机音色与离线可用） |
| sherpa-onnx 跑 Kokoro | 活跃 | 框架 Apache，**但当前 Kokoro 配置同样要求 espeak-ng-data（GPL），官方 issue #3731 计划 2.0 才移除** | **不是**"全 Apache 商业干净路径"，2.x 审计后再评 |
| rhasspy/piper | **已归档**，MIT 冻结版可取；继任 piper1-gpl 为 GPL-3.0 | MIT（冻结版） | 仅离线兜底备选 |
| edge-tts | 在线逆向 API，有 403 史 | — | 与离线优先冲突，不进默认链 |

## 决策

### 1. 采集与推理位置（裁决 #1，有条件采纳）

- 采集：渲染进程 `navigator.mediaDevices.getUserMedia` + **AudioWorklet** 录 16kHz
  单声道 PCM（Electron 的 Chromium 不存在 Tauri 时代 WebView2 的麦克风权限坑）。
- **推理必须放在独立 Web Worker 内，禁止在 UI 线程跑模型**；WASM 是兼容基线，
  WebGPU 是可选加速层（启动探测，不具备/失败即回退 WASM）。

### 2. ASR 暂定主选：Transformers.js + Whisper（裁决 #1）

- 主选 `@huggingface/transformers` + `onnx-community/whisper-base.en` 量化版（约 80MB），
  tiny/base/small 由用户选择；multilingual 模型仅作语音中文兜底的**可选下载**，默认不装。
- whisper.cpp WASM 为备胎；sherpa-onnx WASM、Moonshine 留到 V7 实时流式阶段再评估；vosk 淘汰。
- **词级时间戳的能力边界（产品措辞硬约束）**：Whisper 词级时间戳由注意力权重/DTW
  估算得到，**不是强制对齐（forced alignment）**。因此 V6 跟读台只输出：
  ①漏词提示；②疑似替换提示；③节奏位置提示。
  **不宣称音素级发音判定；不把 Whisper 识别错误直接计为用户发音错误；
  每个问题词必须可点击回听原录音并由用户人工确认。**

### 3. COOP/COEP 按能力启用，不全局注入（裁决 #2，有条件采纳）

多线程 WASM 需要 SharedArrayBuffer（安全上下文 + cross-origin isolation），但隔离头
不能全局打：
1. 使用 `app://` 自定义协议，注册为 `standard + secure + supportFetchAPI + corsEnabled`
   （遵循 Electron 官方"避免 file://、使用安全自定义协议"的建议）；
2. `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` **只加给 app:// 主页面**；
3. Worker 脚本、WASM、模型文件、`app-media://` 资源逐项返回正确的 CORP/CORS；
4. 启动时检查 `self.crossOriginIsolated`；
5. 隔离失败自动退回**单线程 WASM**，功能不得整体报废；
6. V4 的 loopback 接收端（127.0.0.1:47823）不走页面隔离，改动后逐项回归。

### 4. 模型按需下载与安装（裁决 #3，采纳并补强）

ASR/TTS 模型**不打包进绿色目录**，首次使用按需下载到 `data/models/`，且必须具备：
断点续传、磁盘空间预检、原子安装（下载到临时目录、校验通过后切换）、版本回滚、
**签名/哈希清单校验**、每个模型自带许可证元数据（模型权重许可 ≠ 运行时代码许可 ≠
数据文件许可，逐项登记）；tiny/base/small 档位可选。

### 5. 下载通道（裁决 #4，修改后采纳）

- V6 开工前先在 0 号用户网络（广州）实测 huggingface.co 直连；
- **镜像源由用户在设置中配置，不把 hf-mirror.com 硬编码为"可信官方备源"**；
- 商业发行时优先使用自己控制的国内对象存储分发模型。

### 6. TTS 路径重排，商业路径保持未决（裁决 #5，驳回原表述）

原方案把 sherpa-onnx/kokoro-onnx 当作"商业干净路径"是误判：**sherpa-onnx 当前
Kokoro 链路同样依赖 espeak-ng-data（GPL-3.0），框架 Apache-2.0 不等于完整链路干净。**
新顺序：
1. **Web Speech API**：零下载、尽力而为兜底，不保证每台机器的音色一致性与离线可用性；
2. **kokoro-js**：自用/AGPL 版主力（espeak GPL 灰区在自用路径下可接受）；
3. **闭源商业版 TTS：暂不锁定**，等待无 espeak 的成熟英文 G2P，或自行移植/实现
   许可干净的英文 G2P；sherpa-onnx 2.x 发布并完成依赖审计后重新评估；
4. Piper MIT 冻结版仅作离线兜底备选；edge-tts 不进默认链。

### 7. V6 不引入实时 VAD（裁决 #6，采纳）

V6 跟读台是"录完批量识别"，不需要实时 VAD；首尾静音用**简单能量阈值**裁剪即可。
实时 VAD（@ricky0123/vad-web）与实时分段统一移到 V7。

## V6 技术闸门：暂定主选 → 锁定选型

ASR 在通过下列闸门之前，对外与方案措辞只能称"暂定主选"。闸门在 0 号用户目标机上执行：

1. **30 分钟连续转写压力测试**：内存增长曲线、无崩溃；重点盯长音频 WebGPU 显存
   不释放问题（transformers.js 已知 issue #1739），不能只跑几条短样例就锁定；
2. **UI 流畅度**：Worker 隔离下主线程不掉帧、转写可取消；
3. **词级时间戳质量抽检**：方案 §26 的 10 段自录语音回归集 + 2 段中英夹杂用例；
4. **离线重启**：模型就位后断网冷启动，采集→转写→跟读对齐全链路可用；
5. **下载失败恢复**：断网、哈希校验失败、磁盘不足、版本回滚四条路径逐一验证。

未过闸门：启用备胎（whisper.cpp WASM）或缩小 V6 范围，结论写入开发记录。

### 闸门执行记录（2026-09-14 V6 spike，工程 `app-electron/spike-v6/`，详见《V6-spike-语音技术验证报告》）

| 闸门项 | 状态 | 实测 |
|---|---|---|
| ① 30 分钟连续转写 | **通过** | 8 线程 WASM 连续 30 分钟 2783 次，堆 2–4MB 无增长、单次 570–930ms 无漂移、零崩溃，#1739 风险在 WASM 路径不成立 |
| ② UI 流畅度 | **通过（2026-09-16 真机）** | 0 号用户 base 下跟读录音/着色/点词回听/成卡无卡顿；身份隔离真机核对通过 |
| ③ 词级时间戳质量 | **通过（英文）** | 10 句真人回归：纯英文 8 句时间戳单调非零、可点词回听；中英混说时间戳退化为已知边界，跟读台限定英文不受影响 |
| ④ 离线重启 | **通过** | 主进程掐断模型域后冷启动，零网络、Cache 命中 429ms 就绪、转写正确 |
| ⑤ 下载失败恢复 | **通过（含真机，2026-09-16）** | 逻辑层 model-store 44 条单测；真机 `fault-inject.cjs` 13/13：磁盘预检/坏镜像不 commit/中途取消续传/同尺寸篡改自愈；修复完整断点续传 416 latent bug |

### 生产接入记录（2026-09-15 v1.3，正式开发第一步）

spike 结论已搬进生产代码并通过生产集成冒烟（`smoke-v6.cjs`，结果 `spike-v6/smoke-result.json`）：`src/asr/worker.ts`+`asr.ts` 生产 Worker/单例、`VoicePage.tsx`「语音」tab、主进程 `model-store.cjs`、入口由 file:// 改为 `app://app/` 同源协议。冒烟实测：`crossOriginIsolated=true`、本地模型 config 200、生产 Worker 543ms 就绪、jfk 转写 22 词正确（914ms，带词级戳）。新增两条工程固化：①**Electron 38 的 net 没有 `responseFromFileURL`**，本地文件统一走 `serve-file.cjs`（fs 读取），旧 app-media 听力处理器误用该不存在 API 的 latent bug 一并修复；②**COEP require-corp 文档下，module Worker 的 .js/.mjs 响应也必须带 `Cross-Origin-Embedder-Policy: require-corp`**，否则 Worker 在创建期报无位置 error 事件。

spike 额外固化的工程决策：
1. **框架锁 v3.8.1 稳定线，暂不升 v4.2.0**——v4 在本环境 `pipeline()` 发起网络请求前确定性挂起，v3 一次跑通；升 v4 前必须重跑 spike。
2. **WebGPU 本机不可用，默认关闭**：AMD RDNA2 + ort-web 1.22-dev jsep 下转写慢于实时且输出重复乱码；默认多线程 WASM，WebGPU 藏实验开关并做启用前自检回落。
3. 性能：11s 音频，单线程 WASM ≈1.4–1.6s（7.4× 实时），8 线程 ≈0.73–0.83s（15× 实时），满足 V6 批量场景。
4. ort wasm 必须本地化并以 `wasmBinary` 喂入（避开 CDN 挂死 / asyncify Atomics 死锁 / Worker 同步 XHR 经自定义协议 IPC 死锁三个坑）。
5. 模型下载归一化收敛到主进程下载器：可配置源（默认镜像，不硬编码）、CORS 先删后写、30x 重定向拉回可达域。

**闸门结论：WASM 基线"工程可行性已验证"，①30 分钟压测、④离线重启已通过，生产引擎链路与下载器（⑤逻辑层）已接入并通过集成冒烟；剩余 ②真实 UI 流畅度、③真人 10+2 录音回归集、⑤真机故障注入三项关闭前，ASR 维持"暂定主选"，不升"锁定选型"。**

### 封板前硬化记录（2026-09-15 v1.4，V6-ASR-hardening-0）

对抗审查发现 6 个"主链跑通但测试未覆盖"的 P0，本片只修这 6 个并补故障测试，复验通过后才允许进入 l_recog：

1. **模型完整性（裁决 #4 落地补强）**：revision 从可变 `main` 改为**固定 commit `79fb389…`**，随应用内置可信清单（每文件 bytes+sha256，许可证更正为 Apache-2.0）；镜像只传输，`status/ensure/首次加载 modelRuntime` 三处全按可信清单校验，单测复现"同尺寸文件被替换→sha 识破→重新下载自愈"。
2. **原子安装/回滚**：`.part→.stage→全量校验→按 commit 原子切 active`，中途失败不产生新旧混合，旧 commit 目录保留可 `rollback`；单测注入"某文件始终失败→active 零文件、staging 保留、恢复后续装"与"跨 revision 回滚"。
3. **真 Range/206**：`serve-file.cjs` 改异步流式（createReadStream→Readable.toWeb，不再 `readFileSync` 阻塞主进程），真正处理 Range→206/Content-Range、非法→416；25 条单测覆盖穿越矩阵与切片内容。
4. **并发与崩溃恢复**：消息按自增唯一 id 匹配（不再按 type 共享 waiter），`transcribe` 串行排队，worker fatal/error 时拒绝全部在途并 terminate+清空，下次全新重建。
5. **单线程回退——与裁决 #2 第 5 条的实现偏差（有实测证据）**：原计划"拷贝非 threaded WASM 作为回退"，但全树确认 ort-web 1.22-dev **只发布 `ort-wasm-simd-threaded`（含 .jsep），根本没有非 threaded 二进制**。实测该 threaded 产物在 `numThreads=1` 且 `crossOriginIsolated=false` 时走真单线程、不依赖 SharedArrayBuffer（非隔离生产冒烟：460ms 就绪、1586ms 转写、22 词正确）。故保障手段改为**常驻非隔离单线程形态冒烟**（`SMOKE_NOISO=1 SMOKE_THREADS=1`），而非另找二进制；这是对裁决的等价落地，不改变"隔离失败功能不报废"的要求。
6. **防目录穿越**：弃用 `startsWith(root)`，改 `path.relative` 判边界 + 拒绝对绝对路径/盘符/UNC/`..`/非法编码，`%2e%2e%2f` 与同前缀兄弟目录逃逸均被挡。硬化冒烟还实测抓到并修复一个真实集成 bug：严格 safeJoin 会拒绝 URL 自带前导 `/` 导致 app:// 全 403，已在协议层先 slice 前导斜杠。

复验：`pnpm test` 十链全绿（新增 model-store 41、serve-file 25）、tsc=0、vite build=0；隔离 8 线程（455/881ms）与非隔离 1 线程（460/1586ms）两形态生产冒烟均转写出正确 22 词；真机冷启动存活、扩展 47823 接收端回归正常。**闸门⑤的"哈希失败/版本回滚/断网续传"已由故障注入单测关闭，"磁盘不足"与真机断网仍留待真机；②UI 流畅度、③真人 10+2 录音回归集仍待用户侧，ASR 依旧维持"暂定主选"。**

### 功能落地记录（v1.5 l_recog / v1.6 跟读台）

- **l_recog 听音辨义卡**：TTS 走决策第 6 条第一路径 Web Speech/SAPI 本地兜底，零下载；ASR 未参与该卡。
- **跟读台首版（src/shadow/）**：严格按 §19.3 措辞铁律落地——对齐结果只分**漏词 / 疑似替换 / 多读 / 节奏位置（停顿>1.2s）+ 句级匹配率**；UI 不出现"发音评分/读错"字样，疑似替换统一标"疑似读成 X"，每个有时间戳的词可点击 seek 自录原音回听，界面固定声明"识别误差不等于发音错误、非音素级判定"；近形（单复数/时态尾音）做宽松命中以压低 ASR 误差误伤。对齐算法 18 条单测。本版**不**回流 production 证据/SRS（人工确认前不落库，speech_* 表属 V7）；录音仍 MediaRecorder（P1：换 AudioWorklet PCM）。


## 最终决策句（用户裁决原文）

> V6 禁止原生 Node 模块与外部 sidecar，采用浏览器标准音频采集和独立 Web Worker 内
> WASM/WebGPU 推理。ASR 暂定 Transformers.js Whisper，WASM 为兼容基线、WebGPU 为
> 可选加速；TTS 采用系统语音兜底与 Kokoro 自用路径，商业 TTS 在 G2P 许可证审计通过前
> 保持未决。V6 不引入实时 VAD。

## 后果

**得到**：一套 onnxruntime-web 同时承载 ASR 与 TTS，无 C++ 工具链、无 sidecar，
对 SAC 零风险；Electron 38 = 新 Chromium，自带 WebGPU；模型不打包，绿色目录不膨胀
（按需下载约 170MB：ASR ~80MB + TTS ~90MB）。

**放弃**：whisper.cpp 原生的极致量化效率（WASM 备胎保留）；V6 实时流式（批量场景
本就不需要）；商业 TTS 不在本版锁定（接受未决，不硬凑一个带 GPL 的"干净路径"）。

**新约束**：
1. Worker 隔离推理是硬要求，模型永不上主线程；
2. 跨域隔离头作用域仅限 app://，且必须有单线程回退；
3. 依赖许可证审计覆盖**完整链路（含数据文件，如 espeak-ng-data）**，
   框架许可、模型许可、链路许可三者不得混为一件事；
4. 技术闸门通过前，ASR 只能称"暂定主选"。

## 状态

**ASR 于 2026-09-16（v2.3.2）正式升为"锁定选型"：Transformers.js Whisper（默认 whisper-base 多语 q8，WASM 8 线程基线，独立 Web Worker，固定 commit + 可信清单哈希校验）。** 闸门关闭记录：

- **② 真实 UI 流畅度（通过，0 号用户真机）**：冷启动后跟读台 base 下录音、逐词着色、点词回听、问题词确认成卡全程无卡顿；身份隔离场景（先用 tiny.en 跑批量评测、再回跟读台录音存样本）客观核对 manifest，样本 model 字段仍为 `whisper-base`（v2.3.1 修复：评测用独立 Worker、录音前显式确保默认档、保存记实际 modelId）。
- **③ 真人回归集（通过）**：10 句（8 英/1 中/1 中英混）双模型对比，默认档由 tiny.en 升 base——纯英文 8 句宏平均命中率 82.0%→85.2%、微平均 WER 0.185→0.154；中文 tiny 幻觉、base 正确转写（默认繁体）。**措辞铁律补正：两模型共同失败只称"高优先级人工回听候选"，不等于已确认发音错误。** 已知边界：句内中英混说中文被丢、英文词时间戳退化（跟读台限定英文，不影响）。
- **⑤ 真机故障注入（通过，`spike-v6/fault-inject.cjs` 13/13）**：真实镜像 + 真实文件系统验证磁盘预检（8TB 夸大清单下载前拒绝）、坏镜像连接失败不 commit、下载中途取消留断点、续传完成并 7 文件深校验全过、同尺寸篡改哈希识破并自愈。注入中发现并修复一个真实 latent bug：**.part 已完整但未提升时续传会发 `bytes=全长-` 必死 416**——现改为完整断点先哈希直提、416 响应丢弃断点重下；model-store 单测 41→44 条。

历史：2026-09-14/15 spike 验证 WASM 基线工程可行性——30 分钟连续转写（2783 次无内存增长/无延迟漂移）、离线冷启动、8 线程提速、词级时间戳均通过，WebGPU 本机不可用默认关、框架锁 transformers.js v3.8.1；2026-09-15 hardening-0（v1.4）关闭封板前 6 个 P0（固定 commit 可信清单/原子安装回滚/真 Range/并发与 fatal reset/单线程回退实证/防穿越）。
**商业 TTS 仍未决**（Kokoro 链路的 espeak-ng GPL 灰区，等待无 eSpeak 的 G2P 或 sherpa-onnx 2.x 审计）；WebGPU 仍默认关闭；多语 small 不接入（base 已够，混说家族性限制 small 亦无解）。
本 ADR 同步修订方案 v1.6 §15/§19/§23/§25/§27（变更记录 v1.6.2）。
