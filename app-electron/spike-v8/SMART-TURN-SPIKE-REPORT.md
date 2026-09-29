# S13-0a Smart Turn v3.2 技术 Spike 报告

**日期：** 2026-09-25
**目标：** 验证 Smart Turn 端点模型在本机（Electron/CPU）的可行性、推理延迟与准确率，为 #151 TurnAssembler 自动提交状态机提供数据。
**结论：** **通过。** 模型 8.7MB、纯 CPU 单次推理 12–16ms，50 条冻结样本准确率 94%，且与官方基准高度吻合，链路（模型完整性、mel、阈值）全部验证正确。建议进入 #151。

---

## 1. 模型事实

| 项 | 值 |
|---|---|
| 仓库 | https://huggingface.co/pipecat-ai/smart-turn-v3 |
| 文件 | `smart-turn-v3.2-cpu.onnx`（int8 量化） |
| 大小 | 8,679,182 字节 |
| SHA256 | `2bb026316b14a660486a75b1733cd3fbab8c2fd0314dc9af7be49f8cca967e4f` |
| 许可证 | **BSD-2-Clause**（LICENSE 已归档至 `vendor/smart-turn/`） |
| 架构 | Whisper Tiny encoder 主干 + 浅层线性分类头，约 8M 参数 |
| 输入 | `input_features`，Whisper log-mel，形状 `[1, 80, 800]`（16kHz mono，末尾 8s，不足前补零） |
| 输出 | `logits`（标量；sigmoid 后 >0.5 判为「本轮说完」） |
| 语言 | 23 种，含英文、中文；直接分析 PCM 波形，不依赖转写 |

## 2. 评测方法

- 样本来自官方测试集 `pipecat-ai/smart-turn-data-v3.2-test`（HF datasets-server rows API）。
- 冻结 50 条：英文 35（endpoint 18/非 17）、中文 15（endpoint 7/非 8）。
- 特征：复刻 transformers `WhisperFeatureExtractor(chunk_length=8)`——真实样本 zero-mean/unit-var（eps 1e-5）、STFT n_fft=400/hop=160/hann/reflect、80-bin Slaney mel（fmax=8000）、log10 + 8 动态范围 + (x+4)/4。
- 推理：onnxruntime-node 1.24.3，CPU，单线程顺序。

## 3. 结果（与官方基准对照）

| 口径 | 样本 | 准确率 | Precision | Recall | F1 | FPR | FNR |
|---|---:|---:|---:|---:|---:|---:|---:|
| 本 spike 总体 | 50 | **94.0%** | 92.3 | 96.0 | 94.1 | 8.0 | 4.0 |
| 官方总体 | 31,527 | 92.63% | 90.9 | 94.7 | 92.7 | 4.73 | 2.64 |
| 本 spike 英文 | 35 | **97.1%** | 94.7 | 100 | 97.3 | 5.9 | 0 |
| 官方英文 | 7,820 | 94.26% | 92.6 | 95.9 | 94.2 | 3.75 | 1.99 |
| 本 spike 中文 | 15 | **86.7%** | 85.7 | 85.7 | 85.7 | 12.5 | 14.3 |
| 官方中文 | 929 | 85.79% | 89.4 | 81.8 | 85.4 | 4.95 | 9.26 |

- 推理延迟：avg 12ms / p95 14ms / max 16ms（CPU，int8）。
- 3 个错误：2 个假阳性（英文/中文各 1，句中停顿被判说完）、1 个中文假阴性（真说完没识别）。

**判读：**
1. 三类口径全部落在官方基准附近 → 模型文件、mel 实现、0.5 阈值全部正确，不是"碰巧跑通"。
2. 中文 FNR 显著高于英文（官方 9.26 vs 英文 1.99）：模型对中文偏保守，用户说完后可能多等一轮——产品上必须有「最大等待 + 立即发送」兜底。
3. 推理开销可忽略（8MB 模型、12ms），不构成内存/线程负担，可常驻。

## 4. 生产接入设计（#151）

```text
连续麦克风 PCM
   │
   ├─ Silero VAD：实时 speech/silence（已有）
   │
   ▼
TurnAssembler（累计当前轮 PCM）
   │  VAD 报告候选停顿（安静 ≥350ms）
   ▼
Smart Turn（取轮末尾 ≤8s，mel→推理，12ms）
   ├─ 未说完 → 取消提交，继续收音
   ├─ 说完   → Whisper Base 整轮转写一次 → 发送
   └─ 最大等待 2.5s 仍判未说完 → 强制提交（兜底）
用户重新开口 → 取消待提交；「立即发送」按钮始终可用
```

- Smart Turn 与 VAD 同属轻量模型，**不进 InferenceCoordinator 互斥租约**；mel 计算与 Whisper ASR 共用同一套 Whisper 特征代码。
- 运行位置：独立 Web Worker（onnxruntime-web，CPU WASM；8MB int8 无需 WebGPU）。
- 模型随包/走模型商店，固定本次哈希；不跟随 HF 动态版本。

## 5. 边界与未覆盖

- 样本量 50（官方 31,527），指标用于验证链路而非精确定标；中文仅 15 条，FPR 抖动大。
- 未测：与 barge-in 的并发竞态、真实麦克风连续 30 分钟、噪声环境、`um/uh` 填充词专项（样本含 midfiller/endfiller 标记但未专项统计）。
- mel 当前为 Python 实现，#151 需移植为 Worker 内 JS/TS（以本报告指标作为移植正确性回归基线）。
- 产品措辞保持：Smart Turn 只决定「何时提交」，不做任何发音/能力判定。
