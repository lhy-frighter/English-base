# V6 语音栈技术 Spike 验证报告（ADR-3 技术闸门 · 第一轮）

> 目的：在正式开发 V6 听口模块前，用最小可运行工程验证 ADR-3 的关键假设——
> 「Electron 内、独立 Web Worker、纯 WASM/WebGPU、零原生模块、零 sidecar 跑通 Transformers.js Whisper」，
> 并预演技术闸门中的下载、离线、多线程、内存等子项。
> 工程位置：`app-electron/spike-v6/`（独立于主应用，不进生产 bundle）。

## 0. 结论速览

| ADR-3 假设 | 验证结果 |
|---|---|
| 独立 Web Worker 内推理、不阻塞 UI | ✅ 成立（Worker 跑推理，主线程仅解码/调度） |
| WASM 作为兼容基线可跑通 Whisper | ✅ 成立，且性能足够（见 §3） |
| WebGPU 作为可选加速层 | ⚠️ 本机不可用（输出退化+更慢），**默认关闭、藏在开关后**，不影响基线 |
| 自定义协议 + COOP/COEP 拿到 crossOriginIsolated（多线程前提） | ✅ `crossOriginIsolated=true`，8 线程提速约 2× |
| 模型按需下载、下载后完全离线 | ✅ 二次启动 0 网络，Cache API 命中后就绪 0.3–0.5s |
| 禁止原生 Node 模块 / sidecar | ✅ 全程无原生模块（onnxruntime-node 仅被依赖树带入，**代码不引用、构建不打包**） |
| 词级时间戳（跟读台对齐基础） | ✅ 词级 `[start,end]` 正确 |

**总判断：WASM 基线链路打通且性能达标，ASR 可从「暂定主选」推进到「工程可行」；但要升到 ADR-3 定义的「锁定选型」，还需完成 §6 的剩余闸门（30 分钟压测、真人录音回归集、真实 UI 流畅度、模型精度阶梯）。**

## 1. 验证环境

- Electron 38.8.6 / Chromium 140；Windows 10；CPU 32 逻辑核；GPU = AMD RDNA2（WebGPU adapter 可枚举）
- 模型：`Xenova/whisper-tiny.en`，量化 `q8`，合计约 39MB
  （config / generation_config / preprocessor_config / tokenizer×2 + `encoder_model_quantized.onnx` + `decoder_model_merged_quantized.onnx`）
- 测试音频：`jfk.wav`，11.00s，解码为 16kHz 单声道 176000 样本
- 推理库：**@huggingface/transformers 3.8.1（v3 稳定线）** + onnxruntime-web 1.22.0-dev（WASM）

## 2. 网络与模型获取（国内环境实测，影响产品下载器设计）

1. **huggingface.co 直连不可用**：DNS/TCP443 正常，但 TLS 在 SNI 阶段被重置（Node fetch `fetch failed`、curl `http_code=000`）。产品不能把 HF 主站作为默认源。
2. **hf-mirror.com 可用但行为不稳定**，实测到两类抖动，均已在 spike 里找到对策：
   - **CORS 头抖动**：个别响应自带 `Access-Control-Allow-Origin: null` 或缺失，渲染进程 fetch 直接 `Failed to fetch`。
     → 主进程 `webRequest.onHeadersReceived` 对模型域**先删后写**统一补成单个 `*`（不能追加，会变成 `null, *` 非法）。
   - **重定向跳出可达域**：镜像偶发 302 回 `huggingface.co`（不可达）。
     → 主进程拦截 30x，把 `Location` 里的 huggingface.co / hf.co **改写回 hf-mirror.com**，保证不跳出可达域。
3. 大文件（onnx 权重）走 xethub LFS，206 分片可达，偶发 `net::ERR_FAILED` 需要重试（正式下载器要做断点续传，与 ADR-3 一致）。
4. **工程结论（回写 ADR-3/方案）**：模型源必须「用户可配置 + 默认填镜像」，且下载相关的 CORS/重定向归一化必须收敛到**主进程下载器**，渲染层不直接面对镜像抖动。这与用户裁决「不硬编码镜像、商业版走自建对象存储」一致。

## 3. 性能数据（11s 音频，单位 ms）

| 路径 | pipeline 就绪 | 单次转写 | 相对实时 |
|---|---|---|---|
| WASM 单线程（首次，含下载） | 15.8–44s（随网络波动） | 1411 / 1430 / 1487 / 1515 / 1586 | **约 7.4× 快于实时** |
| WASM 8 线程（缓存命中后就绪 0.3s） | 321–460ms | 735 / 744 / 814 / 833 | **约 15× 快于实时** |
| WebGPU（jsep） | 39.5s | 59836 | 慢于实时且输出错误（§4） |
| 离线重启（主进程直接掐断模型域） | **429ms（零网络请求）** | 1418–1515 | 与在线一致 |

- 三次重复转写文本完全一致且正确：
  *"And so my fellow Americans ask not what your country can do for you, ask what you can do for your country."*
- 词级时间戳合理：`And[0–0.76] so[0.76–1.06] my[1.06–1.46] fellow[1.46–1.8] Americans[1.8–2.32] … country[6.02–6.36]`。
- 对 V6「录完批量识别」场景：一段 1–3 分钟跟读音频，8 线程 WASM 预计 4–12s 出结果，**交互上完全可接受**，无需 WebGPU。

## 4. WebGPU 路径：本机判定不可用，默认关闭

- adapter 能枚举（amd rdna-2），pipeline 能建，但转写 11s 音频耗时 **59.8s**，且输出退化为重复乱码
  （`…biasesVIDEO biasesVIDEO biasesVIDEO…` 循环），是 q8 Whisper 在 ort-web 1.22-dev jsep / 该驱动上的数值/执行提供方问题。
- 与 ADR-3「WASM 为兼容基线、WebGPU 为可选加速」一致：**V6 默认走多线程 WASM，WebGPU 藏在实验开关后**，
  并在启用前做一次「已知短句自检」，自检不过自动回落 WASM。后续升级 ort-web / 换模型精度再复测。

## 5. 打通过程中踩到、且正式开发必须继承的坑

1. **框架版本：锁定 v3 稳定线，暂不升 v4。**
   `@huggingface/transformers@4.2.0`（配 onnxruntime-web 1.26-dev）在本环境确定性挂起：
   `pipeline()` 在发起任何网络请求前就永不返回（Worker 心跳正常、CPU 空闲，非死锁/非网络），
   换 loopback origin、关 webSecurity、调线程数、开关缓存均无效；降到 **3.8.1 后一次跑通**。
   → package.json 现锁 3.8.1；升 v4 前必须重跑本 spike。
2. **ort WASM 必须本地化，且用 wasmBinary 通道喂入。**
   - 不显式配置时，ort 默认从 `cdn.jsdelivr.net` 拉 WASM，国内直接挂死且无报错；
   - `wasmPaths` 给字符串会逼 ort 走 asyncify 变体，其 Atomics 自等待在 Worker（proxy=false）里永久死锁；
   - regular threaded 的 `.mjs` 在 Worker 内用**同步 XHR** 取 wasm，经 Electron `protocol.handle` 会 IPC 死锁。
   - 正解：构建时把 `ort-wasm-simd-threaded.wasm/.mjs`（WebGPU 用 `.jsep` 变体）拷到本地，
     运行时自己 `fetch → arrayBuffer` 赋给 `env.backends.onnx.wasm.wasmBinary`，`wasmPaths` 只给 `{mjs}`。
3. **协议选型：用注册为 standard/secure/supportFetchAPI/corsEnabled/stream 的自定义协议 `app-spike://`**，
   只给该协议页面加 COOP `same-origin` + COEP `require-corp`，本地资源补 CORP；启动检查 `crossOriginIsolated`，
   失败自动回落单线程 WASM（不允许整个功能报废）。与 ADR-3「隔离头只加给 app:// 主页面」一致。
4. **英文-only 模型不能传 `language/task`**，否则抛 `Cannot specify task/language for an English-only model`；
   多语模型才需要。V6 若只做英文跟读用 `.en` 模型，更小更快。
5. 依赖安装：pnpm 12 对带 install 脚本的包需在 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies/allowBuilds` 显式审批；
   `onnxruntime-node`、`sharp` 等原生构建一律关掉（ADR-2 铁律：禁原生模块）。

## 6. 距「锁定选型」还差的闸门（本轮未完成项）

- [x] **30 分钟连续转写压力测试**：**已通过**（2783 次/30 分钟，堆 2–4MB 无增长、延迟无漂移，详见 §7）。
- [ ] **真人录音回归集**：方案 §26 要求 10 段自录 + 2 段中英夹杂；现仅用干净的 jfk.wav，**不能代表带口音/环境噪声/卡顿的真实跟读**，需用户录音后跑识别率与词级对齐质量。
- [ ] **真实 UI 流畅度**：spike 是隐藏窗口，需在真实跟读台界面转写时测主线程 rAF 掉帧/输入延迟，证明 Worker 隔离确实不卡 UI。
- [ ] **模型精度阶梯**：tiny 最快但对口音/弱读最敏感，需在真人集上对比 tiny / base / small 的体积、速度、识别率，再定 V6 默认模型。
- [ ] **下载失败恢复**：断点续传、原子安装、磁盘空间预检、版本回滚、哈希清单、逐模型许可证元数据（ADR-3 已定，spike 只验证了 CORS/重定向归一化）。

## 7. 30 分钟压测结果（闸门①，已完成，**通过**）

8 线程 WASM、同一段 11s 音频连续转写 **30 分钟整、2783 次**：

- **内存无增长**：281 个采样点堆内存在 2–4MB 间波动（3MB×227、2MB×52、4MB×2），起始与结束一致，**无单调爬升、无崩溃**。
- **延迟无漂移**：单次转写 min 570 / avg 645 / max 930ms；前 5 次 793,636,668,632,581，后 5 次 799,756,787,758,789，首尾基本持平，没有越跑越慢。
- 结论：**多线程 WASM 路径不存在 #1739 式的长时内存/显存不释放**（该 issue 针对 WebGPU，而 WebGPU 在本机已默认关闭），闸门①通过。
- 过程注记：压测必须以脱离 shell 的独立进程运行（后台任务随会话结束会被回收，第一次在 1300 次时被中断，重跑后满 30 分钟完成）；正式 CI/本地压测脚本同样要独立进程 + 落盘结果。

## 8. 对 V6 正式开发的输入（可直接落地的决策）

1. ASR 运行时：`@huggingface/transformers@3.8.1` + onnxruntime-web，**多线程 WASM 默认、WebGPU 默认关**。
2. 推理放独立 Worker；ort wasm 走本地 `wasmBinary`；自定义协议 + 按能力启用 COOP/COEP，隔离失败回落单线程。
3. 模型下载收敛到主进程下载器：可配置源（默认镜像）、CORS/重定向归一化、断点续传、原子安装、缓存复用（Cache API 命中后 0.3s 就绪）。
4. V6 产品措辞不变（ADR-3 限定）：只给漏词/疑似替换/节奏位置提示，**不宣称音素级发音判定**，Whisper 识别错误不算用户发音错误，问题词可回听人工确认。
5. 跟读台对齐用本次验证过的词级时间戳；但「识别对不对」必须等真人录音回归集，不能只凭 jfk.wav 就锁定模型档位。

---
*本报告为工程 spike 记录，所有数字来自 `spike-v6/` 实跑，非外部引用：
性能/离线见 `spike-result-wasm-webgpu.json`、run-online/run-offline.log；30 分钟压测见
`spike-result-stress30min.json`、run-stress.log。*
