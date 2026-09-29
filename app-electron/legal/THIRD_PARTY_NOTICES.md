# 第三方组件与模型许可声明（THIRD_PARTY_NOTICES）

本应用（个人英语能力底座）在本地推理功能中分发了以下第三方组件与模型。
所有 AI 推理均在本机运行，不经过任何服务端。

## 1. Kokoro-82M 神经语音合成模型（TTS）

- 模型仓库：`onnx-community/Kokoro-82M-v1.0-ONNX`
- 固定版本（commit）：`1939ad2a8e416c0acfeecc08a694d14ef25f2231`
- 分发文件：`config.json`、`tokenizer.json`、`tokenizer_config.json`、
  `onnx/model_quantized.onnx`（q8 量化，约 88 MB）、`voices/af_heart.bin`（音色 Heart，约 510 KB）
- 模型页：https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- 上游模型：Kokoro（hexgrad/kokoro，StyleTTS2）
- 许可证：**Apache License 2.0（模型权重）**，以模型仓库 LICENSE 为准。
- 随应用发布的每个文件均带固定字节数与 SHA-256 可信清单，下载后逐文件校验、原子安装、可回滚。

## 2. phonemizer（音素化封装，npm 包）

- 名称/版本：`phonemizer@1.2.1`
- 来源：https://github.com/xenova/phonemizer.js
- 封装代码许可证：**Apache License 2.0**（随包 LICENSE 见 `vendor/phonemizer/LICENSE.phonemizer`）。
- 本应用以 vendor 形式固定 `dist/phonemizer.js`（ES Module 构建），未在运行时联网拉取该组件。

## 3. eSpeak NG（音素化底层数据与 WASM）—— GPL-3.0-or-later

- `phonemizer@1.2.1` 的浏览器构建**内联了 eSpeak NG 的 WASM 二进制与 espeak-ng-data**，
  eSpeak NG 采用 **GNU General Public License v3.0 或更高版本（GPL-3.0-or-later）**。
- 项目主页：https://github.com/espeak-ng/espeak-ng
- 影响与遵守方式：
  - **自用版本与未来按 AGPL-3.0 开源的发行版**：可以使用与分发，整个音素化链路按
    GPL-3.0 对待（若开源发行，应用整体须采用 AGPL-3.0 兼容许可，并提供对应源代码）。
  - **闭源商业版**：在替换为许可证干净的 G2P（如官方 Misaki Apache-2.0 且关闭 eSpeak
    fallback，并通过词典覆盖率/OOV/WASM 构建/许可证四项复核）之前，**禁止发布该链路**
    （见 ADR-5 裁决 #4，状态 BLOCKED_BY_G2P_LICENSE）。
- 对应源代码获取：eSpeak NG 源代码可从 https://github.com/espeak-ng/espeak-ng 获取；
  phonemizer 构建脚本与版本见上述仓库。自发布日起至少 3 年内可向作者索取与所分发
  WASM 完全对应的完整对应源代码。

## 4. kokoro-js（API 与文本归一化参考）

- 名称/版本：`kokoro-js@1.2.1`
- 来源：https://github.com/hexgrad/kokoro/tree/main/kokoro.js
- 许可证：**Apache License 2.0**（见 `vendor/phonemizer/LICENSE.kokoro-js`）。
- 说明：本应用**不分发** kokoro-js 的自足 bundle（该 bundle 内联 transformers.js 3.5.1，
  在本应用 Electron Worker 内推理永久挂死，见 ADR-5「关键工程发现」）；生产 Worker 为自写
  薄封装，仅参考其文本归一化规则与调用 API。

## 5. Transformers.js / onnxruntime-web（推理运行时）

- `@huggingface/transformers`（锁定 3.8.x，Apache-2.0）与其依赖的
  onnxruntime-web（MIT）：WASM/MJS 运行时随应用安装在 `dist/ort/`，
  许可证以各 npm 包 LICENSE 为准。

## 6. Whisper 语音识别模型（ASR）

- `Xenova/whisper-base`（默认，多语 q8）与 `Xenova/whisper-tiny.en`（英文 q8 备选），
  均固定到具体 commit，许可证以模型仓库标注（Apache-2.0）为准；
  字节数与 SHA-256 见应用内可信清单。

## 7. Bergamot 离线翻译引擎与 en→zh 模型

- 引擎：Bergamot Translator（浏览器 WASM 构建）与 Mozilla Firefox translations
  发布模型（en→zh，llmaat finetune10M qe8，固定导出物）。
- 许可证：**Mozilla Public License 2.0（MPL-2.0）**。
- 来源：https://github.com/mozilla/translations 、
  https://github.com/browsermt/bergamot-translator
- 详见 ADR-4。

## 8. Wiktionary 英语扩展词包（data/packs/wikt-en.sqlite）

- 词条、释义、屈折形态来自 **Wiktionary**，经 wiktextract（kaikki.org）英文转储
  `kaikki.org-dictionary-English.jsonl.gz` 提取（2026-09-21 下载）。
- 选词使用 **FrequencyWords**（hermitdave/FrequencyWords，基于 OpenSubtitles 2018，
  `content/2018/en/en_full.txt`）的频度排名（rank ≤ 200,000）外加少量真实语料需求词。
- 许可证：两者均为 **Creative Commons Attribution-ShareAlike 4.0 International
  （CC-BY-SA-4.0）**。
  - Wiktionary：https://www.wiktionary.org （© Wiktionary 贡献者）
  - wiktextract/kaikki 转储：https://kaikki.org/dictionary/English/
  - FrequencyWords：https://github.com/hermitdave/FrequencyWords
- 影响与遵守方式：
  - **自用版本与未来按 AGPL-3.0 开源的发行版**：可分发，须保留本署名与相同方式共享。
  - **闭源商业版**：CC-BY-SA 具有 copyleft 传染性，**不可将该词包捆绑进闭源发行物**
    （状态 BLOCKED_BY_PACK_LICENSE）；需替换为许可兼容数据源或改为用户自行导入。
- 词包为构建产物，可复现构建脚本：`pack-build/wikt-en/build-pack.cjs`；
  原始转储（约 483 MB gz）仅为构建期数据，不随应用分发。

---

如本文件与各上游仓库 LICENSE 存在冲突，以上游仓库的正式 LICENSE 文本为准。
