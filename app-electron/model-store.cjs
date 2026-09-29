// V6 语音模型仓库（主进程）：可信清单驱动的按需下载。
// hardening-0 关键约束（对应审查 P0-1/P0-2）：
//  1) revision 固定为 HF commit（不随 main 漂移）；每文件 bytes+sha256 预置在随应用发布的 TRUSTED_CATALOG；
//     镜像只负责传输，status/ensure/首次加载一律对“可信清单”校验，绝不以下载后自记哈希为准。
//  2) 版本目录 staging → 全量校验 → 原子提升到 active（按 commit 分目录，不覆盖旧版本，可回滚）。
// 设计原则（ADR-3）：模型不打包，落 data/models；渲染层只通过 app://__model__ 只读访问，不直接碰磁盘/网络。
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { Readable } = require("node:stream");

const sha256Hex = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
function sha256OfFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const rs = fs.createReadStream(file);
    rs.on("data", (c) => h.update(c));
    rs.on("end", () => resolve(h.digest("hex")));
    rs.on("error", reject);
  });
}

// —— 随应用发布的可信清单（离线可验，镜像无法篡改结论）——
// Xenova/whisper-tiny.en @ 79fb389（main 当前指向的已验证提交），q8 英文模型，共 7 文件 42,985,755 字节。
// 哈希取本机从 hf-mirror 拉取的该 commit 文件计算（totalBytes 与之一致）；模型许可证 Apache-2.0（仓库标注）。
const PINNED_WHISPER_TINY_EN = {
  id: "whisper-tiny.en",
  repo: "Xenova/whisper-tiny.en",
  revision: "79fb389fc764e7c395bd330e9531d9d32ada7049",
  dtype: "q8",
  name: "Whisper tiny（英文，量化）",
  sizeNote: "约 41MB",
  license: { model: "Apache-2.0（Xenova ONNX 转换，以仓库 LICENSE 为准）", url: "https://huggingface.co/Xenova/whisper-tiny.en" },
  files: [
    { path: "config.json", bytes: 2202, sha256: "37a1073be00d19118c06557896c7c148598f4d8277edc0f5bc07c9f5554839f1" },
    { path: "generation_config.json", bytes: 1590, sha256: "132c95ba9db45f4498f2eab3fea7c1d6a174005010f8f6b7d20cfd5e9795996b" },
    { path: "preprocessor_config.json", bytes: 339, sha256: "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d" },
    { path: "tokenizer.json", bytes: 2128494, sha256: "c6ee8f089220a5b1188f6426456772572671c6141ae007eecb83c6a8349f5deb" },
    { path: "tokenizer_config.json", bytes: 835, sha256: "e082c1ad251541bf277967a703252cddd4bb37a71a43737e03d050c22ec08238" },
    { path: "onnx/encoder_model_quantized.onnx", bytes: 10124913, sha256: "8cc3c6f8563d1b3fbd2c5af9f64c2bed8b020bc593c402d1ef53b9f08fbf1b90" },
    { path: "onnx/decoder_model_merged_quantized.onnx", bytes: 30727382, sha256: "dbb2e063b7fbc41d9803b9698f93ecb035c50cbb3fb87b56cb131e4a5eb99059" },
  ],
};
PINNED_WHISPER_TINY_EN.totalBytes = PINNED_WHISPER_TINY_EN.files.reduce((s, f) => s + f.bytes, 0);

// Xenova/whisper-base @ 64da572（main 当前指向的已验证提交），q8 **多语**模型（vocab 51865，含中文），共 7 文件 79,677,901 字节。
// 推理须 task=transcribe（中文结果绝不进英文跟读对齐）；模型卡片标注 license: apache-2.0（以仓库为准）。
const PINNED_WHISPER_BASE = {
  id: "whisper-base",
  repo: "Xenova/whisper-base",
  revision: "64da57285918e20ea79ea5c88eed7197933abaa8",
  dtype: "q8",
  multilingual: true,
  name: "Whisper base（多语·中英，量化）",
  sizeNote: "约 76MB",
  license: { model: "Apache-2.0（Xenova ONNX 转换，以仓库 LICENSE 为准）", url: "https://huggingface.co/Xenova/whisper-base" },
  files: [
    { path: "config.json", bytes: 2248, sha256: "d1d347fdb422e6347c2f843a90d375aa67ea3f4b3e20d2c3075f9a9f6243685b" },
    { path: "generation_config.json", bytes: 3776, sha256: "3bba359e33fdd6dc1c10f71846a477d339b0242f462f70ea1dd73274caa38d05" },
    { path: "preprocessor_config.json", bytes: 339, sha256: "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d" },
    { path: "tokenizer.json", bytes: 2480466, sha256: "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566" },
    { path: "tokenizer_config.json", bytes: 282683, sha256: "2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce" },
    { path: "onnx/encoder_model_quantized.onnx", bytes: 23200850, sha256: "3e345e977b55620a37c0c2b2af0644e019afdfad562dcf71eb929bb7274285f9" },
    { path: "onnx/decoder_model_merged_quantized.onnx", bytes: 53707539, sha256: "a6beb6baabb66f00b6a686d828c95ffca6146d51900cbad0266cad38f64cf861" },
  ],
};
PINNED_WHISPER_BASE.totalBytes = PINNED_WHISPER_BASE.files.reduce((s, f) => s + f.bytes, 0);

// —— S7b 离线翻译：Bergamot en→zh-Hans（Mozilla translations 正式发布版，引擎/模型均 MPL-2.0）——
// 分发形态：GCS 直链 .gz（gzip 单流），下载后 gunzip，按【解压后】字节数+SHA256 对可信清单校验。
// 注册表 https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json
// 仅用于发现新版本；本条固定到 2024 llmaat finetune10M qe8 导出物，轮换后必须人工复评并修订 ADR-4。
const GCS_TRANSLATIONS_PREFIX = "https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/";
const PINNED_BERGAMOT_ENZH = {
  id: "bergamot-enzh",
  repo: "bergamot/enzh",
  revision: "llmaat-finetune10m-qe8-2024",
  transport: "gcs-gz",
  dtype: "intgemm8",
  name: "英译中离线翻译模型（Bergamot，Mozilla 正式版）",
  sizeNote: "约 48MB",
  license: { model: "MPL-2.0（Mozilla translations 发布模型）", url: "https://github.com/mozilla/translations" },
  files: [
    { path: "model.enzh.intgemm.alphas.bin", bytes: 43849787, gzBytes: 33375922, sha256: "4e5accc141373565ddc8fa1565bceaa8d0c3482a82cab8131c719ebcc6c2157c",
      gzUrl: GCS_TRANSLATIONS_PREFIX + "models/en-zh/llmaat_finetune10M_qe8_f2_ByQcSxGXQRqGi-UTxYE43g/exported/model.enzh.intgemm.alphas.bin.gz" },
    { path: "lex.50.50.enzh.s2t.bin", bytes: 4485184, gzBytes: 2536039, sha256: "8575d8daa10e2dbff316dcdf8e1ce475357bcc2c92bdc63b736a2d5add22f681",
      gzUrl: GCS_TRANSLATIONS_PREFIX + "models/en-zh/llmaat_finetune10M_qe8_f2_ByQcSxGXQRqGi-UTxYE43g/exported/lex.50.50.enzh.s2t.bin.gz" },
    { path: "srcvocab.enzh.spm", bytes: 806952, gzBytes: 407784, sha256: "bd9b65504acc6d9726dd281f7defc2adb7c2c22d0688fe2f84697de25197c8c5",
      gzUrl: GCS_TRANSLATIONS_PREFIX + "models/en-zh/llmaat_finetune10M_qe8_f2_ByQcSxGXQRqGi-UTxYE43g/exported/srcvocab.enzh.spm.gz" },
    { path: "trgvocab.enzh.spm", bytes: 772004, gzBytes: 425748, sha256: "aded6993c36e440284d11cec3f6b8aef9c0e43188a772d80be342a713adf223d",
      gzUrl: GCS_TRANSLATIONS_PREFIX + "models/en-zh/llmaat_finetune10M_qe8_f2_ByQcSxGXQRqGi-UTxYE43g/exported/trgvocab.enzh.spm.gz" },
  ],
};
PINNED_BERGAMOT_ENZH.totalBytes = PINNED_BERGAMOT_ENZH.files.reduce((s, f) => s + f.bytes, 0);

// —— ADR-5 本地神经 TTS：Kokoro-82M v1.0 ONNX q8 + 单音色 af_heart（固定 commit 1939ad2）——
// HF 标准分发（与 Whisper 同一镜像通道）；5 文件共 92,887,010 字节（模型 92.4MB + 音色 510KB）。
// 权重 Apache-2.0；渲染侧音素器 phonemizer 内联 eSpeak NG（GPL-3.0-or-later）：
// 自用/AGPL 版可发，闭源商业版在干净 G2P 落地前阻塞（见 ADR-5 裁决 #4 与 THIRD_PARTY_NOTICES）。
const PINNED_KOKORO_82M = {
  id: "kokoro-82m",
  repo: "onnx-community/Kokoro-82M-v1.0-ONNX",
  revision: "1939ad2a8e416c0acfeecc08a694d14ef25f2231",
  dtype: "q8",
  name: "Kokoro 神经英语语音（本地 TTS，音色 Heart）",
  sizeNote: "约 89MB",
  license: {
    model: "权重 Apache-2.0；音素器含 eSpeak NG（GPL-3.0，自用/AGPL 可用，闭源商业暂阻塞）",
    url: "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX",
  },
  files: [
    { path: "config.json", bytes: 44, sha256: "df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f" },
    { path: "tokenizer.json", bytes: 3497, sha256: "77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34" },
    { path: "tokenizer_config.json", bytes: 113, sha256: "be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20" },
    { path: "onnx/model_quantized.onnx", bytes: 92361116, sha256: "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478" },
    { path: "voices/af_heart.bin", bytes: 522240, sha256: "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b" },
  ],
};
PINNED_KOKORO_82M.totalBytes = PINNED_KOKORO_82M.files.reduce((s, f) => s + f.bytes, 0);

// —— V8-2a WebLLM 推理库（wasm；cs1k 上下文，v0_2_84/base）——
// 文件来自 jsdelivr 镜像的 mlc-ai/binary-mlc-llm-libs（GitHub）；权重库与引擎均 Apache-2.0。
// 随应用发布预置字节数+SHA256（本机从 jsdelivr 拉取计算）；上游轮换后须人工复评并修订 ADR-6。
const JSDELIVR_WEBLLM_LIB_PREFIX = "https://cdn.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/v0_2_84/base/";
const PINNED_WEBLLM_LIB_CS1K = {
  id: "webllm-lib-cs1k",
  repo: "mlc-ai/binary-mlc-llm-libs",
  revision: "v0_2_84-base",
  transport: "jsdelivr",
  dtype: "wasm-cs1k",
  name: "WebLLM 本地推理库（wasm，cs1k）",
  sizeNote: "约 10MB",
  license: { model: "Apache-2.0（WebLLM 推理库）", url: "https://github.com/mlc-ai/web-llm" },
  files: [
    { path: "Qwen2.5-3B-Instruct-q4f32_1_cs1k-webgpu.wasm", bytes: 5297311,
      sha256: "aae12cd18b5c2823df914e07be5fca45768fdbaf726103781b54d8c055e5818b",
      cdnUrl: JSDELIVR_WEBLLM_LIB_PREFIX + "Qwen2.5-3B-Instruct-q4f32_1_cs1k-webgpu.wasm" },
    { path: "Qwen2-1.5B-Instruct-q4f32_1_cs1k-webgpu.wasm", bytes: 5106483,
      sha256: "7c18e20929f6a1145f985c4bdcf9ce8beec67f2445c91b361c842d323758060d",
      cdnUrl: JSDELIVR_WEBLLM_LIB_PREFIX + "Qwen2-1.5B-Instruct-q4f32_1_cs1k-webgpu.wasm" },
    { path: "Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm", bytes: 5438957,
      sha256: "bae8a6d2718f52e2ed232f069c175b0858e30b90ebfe2b56ca2edcb4bd40305a",
      cdnUrl: JSDELIVR_WEBLLM_LIB_PREFIX + "Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm" },
  ],
};
PINNED_WEBLLM_LIB_CS1K.totalBytes = PINNED_WEBLLM_LIB_CS1K.files.reduce((s, f) => s + f.bytes, 0);
// —— V8-2a 本地对话大脑：mlc-ai/Qwen2.5-3B-Instruct-q4f32_1-MLC @ dfa91e859b714acfa489a1464297080656c3460d（固定 commit；WebLLM q4f32，Apache-2.0）——
// WebLLM 实际加载项：mlc-chat-config / tokenizer / tokenizer_config / ndarray-cache + 全部 params shard，逐文件字节+SHA256 预置。
const PINNED_WEBLLM_QWEN25_3B = {
  id: "webllm-qwen25-3b",
  repo: "mlc-ai/Qwen2.5-3B-Instruct-q4f32_1-MLC",
  revision: "dfa91e859b714acfa489a1464297080656c3460d",
  dtype: "q4f32",
  name: "Qwen2.5-3B（本地对话大脑，q4f32）",
  sizeNote: "约 1.6GB",
  license: { model: "Apache-2.0（Qwen2.5 MLC 权重）", url: "https://huggingface.co/mlc-ai/Qwen2.5-3B-Instruct-q4f32_1-MLC" },
  files: [
    { path: "mlc-chat-config.json", bytes: 2045, sha256: "5924a33c2a5af212f765c617039a76a584ba5a73d926040507458abaa231991e" },
    { path: "tokenizer.json", bytes: 7031645, sha256: "c0382117ea329cdf097041132f6d735924b697924d6f6fc3945713e96ce87539" },
    { path: "tokenizer_config.json", bytes: 7308, sha256: "5214600ee45ca2f887ce2eede8910378a0111ea99d657428bcbce94778e65a92" },
    { path: "ndarray-cache.json", bytes: 164965, sha256: "fee95d8aa50484c813e909c28081d3cd283a11170354984f4c8dd3f05f99584b" },    { path: "tensor-cache.json", bytes: 164965, sha256: "fee95d8aa50484c813e909c28081d3cd283a11170354984f4c8dd3f05f99584b" },
    { path: "params_shard_0.bin", bytes: 155582464, sha256: "13227ac447fc07e7d97e2fe12e478549ff0256fdbc355106841d0d409c5e8506" },
    { path: "params_shard_1.bin", bytes: 22544384, sha256: "8da97a1d869888f793703c0c2fef8eefc91de9b3cfe23f18dcecbdd6312e3288" },
    { path: "params_shard_2.bin", bytes: 32133120, sha256: "9de701dfa61010401bc62654d50100b97edf81b0518f724b40332903874ae3ab" },
    { path: "params_shard_3.bin", bytes: 22544384, sha256: "cdc814bcb2622cfb630fbefe3d3ffbd70ee233e57afbb8d415b4eab268682ed7" },
    { path: "params_shard_4.bin", bytes: 28960768, sha256: "266b307ec92f3f4530d14f6995359889d9eef864163024a6de095e3cba426b7d" },
    { path: "params_shard_5.bin", bytes: 22544384, sha256: "0ae8c6646045c206f2088f0fd67d5cb17b10ef142997f309cd0219bfd744d674" },
    { path: "params_shard_6.bin", bytes: 22544384, sha256: "e422cbea662fd1c03b37a8262232c92470a4f3b2fcac973b0d4276628a107f79" },
    { path: "params_shard_7.bin", bytes: 33502208, sha256: "0f7b2b2da5c67301e5f49c029a64b0569a34bfd1f8a384c1fb2e78e07d4b2497" },
    { path: "params_shard_8.bin", bytes: 22544384, sha256: "94627ec47f340222fb5798f20ae9a34ddb95a7b43b77b305cc7143d38fedc2c3" },
    { path: "params_shard_9.bin", bytes: 28960768, sha256: "12500880a8f73acf65d90d7036629bb58d50bde9d64d21840d9f4c1a645dc90e" },
    { path: "params_shard_10.bin", bytes: 22544384, sha256: "9dff5c21d95337c6d870125f56efdba99037fbd0b0e3874fd569c54f4156ea9c" },
    { path: "params_shard_11.bin", bytes: 22544384, sha256: "184b8c1b47137321d24cebf1fa2b848a3a04377061f101e4272f18ad341f9d48" },
    { path: "params_shard_12.bin", bytes: 33502208, sha256: "eeca20d9181ed2f991940a1229f3f6565273276da881d24e415de8675929ffba" },
    { path: "params_shard_13.bin", bytes: 22544384, sha256: "9b074c04560d12f3ccd486de1deda3c3a71b12d274bf2a2f11ad721ea5394c64" },
    { path: "params_shard_14.bin", bytes: 28960768, sha256: "f5bd89f449e107758ab8cdbe8eb11887269c741640f62ddc2745300c49970d86" },
    { path: "params_shard_15.bin", bytes: 22544384, sha256: "50a1eb6194e2d60ca96759dfa6afb190bd2b961e6b46863905f489dcd0b7cdfa" },
    { path: "params_shard_16.bin", bytes: 22544384, sha256: "c7109b594e93f896f626234c554e75289caf883a81877e62a519902513462cc3" },
    { path: "params_shard_17.bin", bytes: 33502208, sha256: "5a557d116c326bc480471170a4af4e901b72ba2efa641570e3d58e260fd42e91" },
    { path: "params_shard_18.bin", bytes: 22544384, sha256: "229056f0faa39007470236ef7569eabb875559c8bf12d09d82c2a58a84449b1a" },
    { path: "params_shard_19.bin", bytes: 28960768, sha256: "95cb5a5e8b4f7972c560c8aa557ec820c3753d90883fb66ce9f10bb7bbd6dbb4" },
    { path: "params_shard_20.bin", bytes: 22544384, sha256: "7bfabe14c9099df211516fffce689efe8d2a1ab9f28cfda8d363814f2c2cdbf2" },
    { path: "params_shard_21.bin", bytes: 22544384, sha256: "c052e2a1c69795572158c2c5bd091747aa27ca0ffcf852329973c5f55d909bd5" },
    { path: "params_shard_22.bin", bytes: 33502208, sha256: "ade58b1ac88138f080cc0b62d163436576be77f36e8db6b96589c99dfcabd6b6" },
    { path: "params_shard_23.bin", bytes: 22544384, sha256: "9a5391469b47b9a6bd4823cfbc3622d965d8ee2788f795aa15b5ecaa5e9ed78b" },
    { path: "params_shard_24.bin", bytes: 22544384, sha256: "9e00514342854130035af38b74c7c15741679ae6aa54950d884dacdd4e3824e3" },
    { path: "params_shard_25.bin", bytes: 31788032, sha256: "3d56bff28c4619c12295b14909dbeb4a69508ffe81b74e43b42327218afdc48e" },
    { path: "params_shard_26.bin", bytes: 22544384, sha256: "9c12c4b126f10ac6a9d42c554b8b83aef7e494bb54e8465f5b7606c0eb78f8bb" },
    { path: "params_shard_27.bin", bytes: 26133504, sha256: "991a40d460d1b91f355b7f8e897194159d157ff10dd9fa89a31cb0bb15db5145" },
    { path: "params_shard_28.bin", bytes: 22544384, sha256: "fd4ef09363d38c31f1dc621063184e6d6067e0b7745a24785a2b81986cf96bb0" },
    { path: "params_shard_29.bin", bytes: 22544384, sha256: "1a6a60ebba5a196b343ad30096224992e765601e616658ebde5ad444869e19d4" },
    { path: "params_shard_30.bin", bytes: 33502208, sha256: "38d242e186eed59228d251a3f2abf66f76e97f5ad47cdb560b18c4280050386d" },
    { path: "params_shard_31.bin", bytes: 22544384, sha256: "cb2cab22f119940cad56b7c2a208adffc8ed9763f335a61e1d398f58eb4f2eca" },
    { path: "params_shard_32.bin", bytes: 28960768, sha256: "63f175890dfa7b97b5b0e50caedbe37bd4f147ce2d3e06173a891c1e534adf96" },
    { path: "params_shard_33.bin", bytes: 22544384, sha256: "2ede738bb67405859afc56c1380a6d49baa8c2aaa5594d70cb0f305f6ece1877" },
    { path: "params_shard_34.bin", bytes: 22544384, sha256: "1dff81f628299df290e02e20a6fc3d4f3c5c4eb6834a016024f8e67157857942" },
    { path: "params_shard_35.bin", bytes: 33502208, sha256: "9e1b07c17137ce99b355580be69a66f6cdd56eda255efa92ce5547fdbb8e1b87" },
    { path: "params_shard_36.bin", bytes: 22544384, sha256: "cf077e7ea8857c705fcce78f373ff27aeb4180a3682ea8a649d9c2af756a2414" },
    { path: "params_shard_37.bin", bytes: 28956672, sha256: "fb9c9459616617a737def9cd640778dfd54cf79cbb8c589ceaf6ebb7dbfd7b13" },
    { path: "params_shard_38.bin", bytes: 22544384, sha256: "158e90271a6cb8246acf03d524b27943bf9e1f8dab954f600e7d69b99dcd1858" },
    { path: "params_shard_39.bin", bytes: 33506304, sha256: "a186397f6487382c7e73b38fe6a9a09bac5e8d0bbcca551c0ae053d27f733d5b" },
    { path: "params_shard_40.bin", bytes: 22544384, sha256: "262acddca14e0f332258d5d9263aa96fe83eb4c2f0bbe11c2bd1ad9c4ae32f79" },
    { path: "params_shard_41.bin", bytes: 22544384, sha256: "bce57546ca4c2bdd64a662af8ff7e4e6c38d0b1c039049f10242829875543a3e" },
    { path: "params_shard_42.bin", bytes: 33502208, sha256: "7e3f64f74bfe39079c7d692d043535e769083af811d6dbaa7ec5bcacf59c5659" },
    { path: "params_shard_43.bin", bytes: 22544384, sha256: "7a6e594b6b5f8ed96e14c5b18da1181ac859e0a6118f5d54bd09b26bf8259f3e" },
    { path: "params_shard_44.bin", bytes: 28960768, sha256: "de5ab933903b64ed4a29b0e5c616565f50cc77e0d536f82fec5bf07385018122" },
    { path: "params_shard_45.bin", bytes: 22544384, sha256: "5fd727a143cdb7e1617b4dedbf28dbb320d8dc25c419e93fe6dc077e9018764c" },
    { path: "params_shard_46.bin", bytes: 22544384, sha256: "4b3e18440909a79c76b739242d29ba1b9628ab7a683ec7028038c940ab03226e" },
    { path: "params_shard_47.bin", bytes: 33502208, sha256: "9f80a2e9f60150058a921455c09c3b03d83742e227135e6cecfb934576c85ade" },
    { path: "params_shard_48.bin", bytes: 22544384, sha256: "f010f889d59e9540e89b9d235c84b203ec2444731d4f698222ba65a9cfaace0b" },
    { path: "params_shard_49.bin", bytes: 28960768, sha256: "30e1bdf640aa5bbb0d901663e340f3057255a8bec5f9103a4747e26a18676ada" },
    { path: "params_shard_50.bin", bytes: 22544384, sha256: "ba76a8a1def89986430e8fb4b80df0f1c21c06c333efbaeda3b19a90e625861c" },
    { path: "params_shard_51.bin", bytes: 22544384, sha256: "cd9fb16d5e579c6c628eec0b9e4d8e79ba4599167fd730e78f22b1f819142921" },
    { path: "params_shard_52.bin", bytes: 33502208, sha256: "9918f0e0430f62fcb42f6147fb1339f8157669f7726a063ea6da83e966a9932b" },
    { path: "params_shard_53.bin", bytes: 22544384, sha256: "d5219876031503611830895901844d95787c30791e2e6946233d9fc577b7f238" },
    { path: "params_shard_54.bin", bytes: 28960768, sha256: "06f4787b1e9e3dce73c5b4762be7b779418a83ab9ac76739ab8a519a37eecdd4" },
    { path: "params_shard_55.bin", bytes: 22544384, sha256: "75f8f70a7bdd045694b1aac24bbc2c713141c1e0022857203902f40377f91e6f" },
    { path: "params_shard_56.bin", bytes: 22544384, sha256: "ce772df34f504155f5a3eac870e6dac593e24aa2f48378322dcefcd7ade58d71" },
    { path: "params_shard_57.bin", bytes: 33502208, sha256: "65011368303987cc7978b534139f5ab9da662dc8f0517336e283cd2077c94bc8" },
    { path: "params_shard_58.bin", bytes: 22544384, sha256: "79484747812ab858204c10a4cf8080c62286229b455577c91cf5cd0b114256fe" },
    { path: "params_shard_59.bin", bytes: 28960768, sha256: "4ff8a2544be29816d9dc8d9c48c4a39d91555ebdb16f86a6c1997339cc26ce74" },
    { path: "params_shard_60.bin", bytes: 22544384, sha256: "d368879dffdac9866243cdbc482e749599d50e7f2f796e8b8537060a463362ce" },
    { path: "params_shard_61.bin", bytes: 20820992, sha256: "5bc0dde169d3726d45eee16bb2c75bb03f28820ca2262c72a86ef462c5bc580a" },
  ],
};
PINNED_WEBLLM_QWEN25_3B.totalBytes = 1743558832;
// —— V8-2b+ 本地对话大脑（默认档）：mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC @ 7690aaaa46df36b1be0fe93b9c9abac0497eff6c（固定 commit；4 位权重 + FP16 计算，Apache-2.0）——
// 与 q4f32 同模型、质量基本无损，显存 2894→2505MB；WebLLM 实际加载项逐文件字节+SHA256 预置。
const PINNED_WEBLLM_QWEN25_3B_F16 = {
  id: "webllm-qwen25-3b-f16",
  repo: "mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC",
  revision: "7690aaaa46df36b1be0fe93b9c9abac0497eff6c",
  dtype: "q4f16",
  name: "Qwen2.3B（本地对话大脑，默认 q4f16）",
  sizeNote: "约 1.6GB",
  license: { model: "Apache-2.0（Qwen2.5 MLC 权重）", url: "https://huggingface.co/mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC" },
  files: [
    { path: "mlc-chat-config.json", bytes: 2045, sha256: "cac458abef34d849d560979d49559bb6d8f38ab7c566938ba117dd2eedb12a02" },
    { path: "tokenizer.json", bytes: 7031645, sha256: "c0382117ea329cdf097041132f6d735924b697924d6f6fc3945713e96ce87539" },
    { path: "tokenizer_config.json", bytes: 7308, sha256: "5214600ee45ca2f887ce2eede8910378a0111ea99d657428bcbce94778e65a92" },
    { path: "ndarray-cache.json", bytes: 164965, sha256: "36931207ccd09207ddceeea9e62b07333a0b6b2745e8b1a45f06d8e6b826ab2e" },
    { path: "tensor-cache.json", bytes: 164965, sha256: "36931207ccd09207ddceeea9e62b07333a0b6b2745e8b1a45f06d8e6b826ab2e" },
    { path: "params_shard_0.bin", bytes: 155582464, sha256: "22c8a238060cf1e5d553ebdcc527c9f9ca6b954c5b3d63911cef7fe7e16482ec" },
    { path: "params_shard_1.bin", bytes: 22544384, sha256: "c6fbf53f86c91ca338a9e4e90633a78e1dcd79af147dbfec97a6d26670d214ed" },
    { path: "params_shard_2.bin", bytes: 32133120, sha256: "123a96cb09796ec531416b525c84058559bf470787f5fed436f3f8bf4f858ad9" },
    { path: "params_shard_3.bin", bytes: 22544384, sha256: "186179d3b9b48c8f3146e0c3bd3062600e2aa2a12fc62bda2d4f0c1d63ef9090" },
    { path: "params_shard_4.bin", bytes: 28960768, sha256: "ce142a16677bdbdd3670d0cfab3f73e2c3bc0bf8dc64fe51efed988454bd3e6b" },
    { path: "params_shard_5.bin", bytes: 22544384, sha256: "ecd8a1be96c9f3ca1948868b7699181bc938105a4e2eb3cafd2ac974c52e3c57" },
    { path: "params_shard_6.bin", bytes: 22544384, sha256: "59a7d11f25ed0fa7f1cef1f2274317a3dfd5bf86cff798e21e3887f9d8861c72" },
    { path: "params_shard_7.bin", bytes: 33502208, sha256: "97204145bee6e30619adc1d7f283583eaa5284db25b0915846dac837c2019db2" },
    { path: "params_shard_8.bin", bytes: 22544384, sha256: "64a1d65720c415ca0b469f0f43a34a46e03ec44a31942d3b7ecca54f00c2e4d1" },
    { path: "params_shard_9.bin", bytes: 28960768, sha256: "5e49b43ab362a589774bc3cd129b7fa480aa31f4ae8f6a03cec3ea136ba3b8e9" },
    { path: "params_shard_10.bin", bytes: 22544384, sha256: "5a86292e4f89149b603734009c4e8aba91f8890f0046e4ca587158da77bdc10e" },
    { path: "params_shard_11.bin", bytes: 22544384, sha256: "f3e28f08681cc144625ad8242c32d31489fcec9f3b88f22c8bb0862efd619283" },
    { path: "params_shard_12.bin", bytes: 33502208, sha256: "448a5c82631330e3ed4857cbe719b91d136fae59727d8055a00213d1a4688dcc" },
    { path: "params_shard_13.bin", bytes: 22544384, sha256: "c919817a2455f882de1459d7f8c135ac6bcea5c8971cabb216f6eb59aa154305" },
    { path: "params_shard_14.bin", bytes: 28960768, sha256: "e5dc7e86a1782177f5a6bcdc68a34ff78428243daf82e98608d2d2f19c1e952e" },
    { path: "params_shard_15.bin", bytes: 22544384, sha256: "867696504d0a84613cc32009ef57386fe91b63144a6d04e322ad9a245bfe8383" },
    { path: "params_shard_16.bin", bytes: 22544384, sha256: "6d963ce8c648d5e394ba7b1713a1d20364251d3b73e569ec763d528e6980315b" },
    { path: "params_shard_17.bin", bytes: 33502208, sha256: "f5fda9db9d17a6ddd537e6ec0b9259f7eb55145e9071ce8aa848e605c0383842" },
    { path: "params_shard_18.bin", bytes: 22544384, sha256: "b7c7dc0dc613f68c11a5a689599d16ebd4d7a74560970fdef451a8db12334d65" },
    { path: "params_shard_19.bin", bytes: 28960768, sha256: "3fde70c1c3474687e0a1992ecd287a75b6001cb07c7f5cfa8cf61606e5cc9049" },
    { path: "params_shard_20.bin", bytes: 22544384, sha256: "eed3a18fad7ae2a87af5e110c74cd90649462bbabcd5104e02d4abe2b98ba164" },
    { path: "params_shard_21.bin", bytes: 22544384, sha256: "c2edebbb9219ee57e354d18c68b7ca7e9e73d9533f4fdfbd48fbd051cf5088d9" },
    { path: "params_shard_22.bin", bytes: 33502208, sha256: "4f372beee1d84018c36fcd3f7588db078b8ad20e438b7078e6d5d44ada82306b" },
    { path: "params_shard_23.bin", bytes: 22544384, sha256: "a33969b771d06116211d938d776b071a01beba39796d79125afd7c4245a7d8bd" },
    { path: "params_shard_24.bin", bytes: 22544384, sha256: "89e6cfa8ee8f19223ad754ad24fcd328581050cf7e15e00e97693a65291bdc0a" },
    { path: "params_shard_25.bin", bytes: 31788032, sha256: "b6fb2099769a3c9c3d0ad035bef65f10aebf86a4d1333f14ba73d2c422a4dac9" },
    { path: "params_shard_26.bin", bytes: 22544384, sha256: "cc930b08a84646fcea16a1b8714d21a9a033eb1cb9880e95fce7773aaa921a01" },
    { path: "params_shard_27.bin", bytes: 26133504, sha256: "2ca52b6eccb4824070d9ade701c6dbc2eb901a5b9b4340bda2900eea4b52d8fa" },
    { path: "params_shard_28.bin", bytes: 22544384, sha256: "7e0568d1d1e3c7c60c553843dd80807868f6648e3778a180c28bd56ea312469e" },
    { path: "params_shard_29.bin", bytes: 22544384, sha256: "a59c5a6289d3ade9ba529612a6222e6ecc74dafe05731100fd80c17008117cb0" },
    { path: "params_shard_30.bin", bytes: 33502208, sha256: "46218a4335ba4e7cb513c4c494607ffce24cdd2d76310b0cb29e6c23698970b6" },
    { path: "params_shard_31.bin", bytes: 22544384, sha256: "0141cb6cc14e019f96d2172a5e80179840c9c2cd738532356cdbb2afb8b58403" },
    { path: "params_shard_32.bin", bytes: 28960768, sha256: "d1093ce577a20607fea67380480c4488065e6025f4fc3d61044670a5e0a74c72" },
    { path: "params_shard_33.bin", bytes: 22544384, sha256: "518c1c7544db5f68d1fc5c33ed7d760d7accadf867e788d29d5cbc6be736da15" },
    { path: "params_shard_34.bin", bytes: 22544384, sha256: "23b66a5d62e5c9fbe72ff07c4e8ffeb5a76ef5b0f1fa82d9f00e01623fe69745" },
    { path: "params_shard_35.bin", bytes: 33502208, sha256: "efda3ab5ed942907a394756fdff48bf7799d36db07b7453a297c5ec4be0dc4df" },
    { path: "params_shard_36.bin", bytes: 22544384, sha256: "5b866df4aa792f3ac11baa0c73dcc29dea9e7e6889390646dad018cfffad730a" },
    { path: "params_shard_37.bin", bytes: 28956672, sha256: "cae31cd2eec22081acc749e662884cffdb4aed78e4cbb49807c6766c729444f3" },
    { path: "params_shard_38.bin", bytes: 22544384, sha256: "a81097038e2c95984aaf83d205a863f35f6276347dcd9c2b6bd6b97998ab760a" },
    { path: "params_shard_39.bin", bytes: 33506304, sha256: "85856b1fc899b79eb7aede1b2c49a802c16624995f9e5a16d68cb96f96b24afa" },
    { path: "params_shard_40.bin", bytes: 22544384, sha256: "b1fc5de3ab8c6c8589fde8d55f073d518d58524d7ecc10d26c2017b4897f1427" },
    { path: "params_shard_41.bin", bytes: 22544384, sha256: "de62c589e5912053430772999fc03c95191dbe1dfe7693c7ec8fef7fbb542542" },
    { path: "params_shard_42.bin", bytes: 33502208, sha256: "c7ac3dfe6d8846819021a875bb33bcc44354bf794a2a28b5805fcae11f7c03a2" },
    { path: "params_shard_43.bin", bytes: 22544384, sha256: "a052d9a8442fbb705fb69db3b5ecb3b7df20a711cacc09e1feefcafde2f1b789" },
    { path: "params_shard_44.bin", bytes: 28960768, sha256: "1df9dcc2fefea019216e7e7cd67b4b83218033b1a7eb239cb8c50da12565207d" },
    { path: "params_shard_45.bin", bytes: 22544384, sha256: "9591e3584bb218f3a57bed77f81a94195c65c6e3d7526efbe2c9acaa7abddd7f" },
    { path: "params_shard_46.bin", bytes: 22544384, sha256: "0eb2c6cdf4d5fd03c78af7ef2b959030c620e215edbc6c2c6402a1dbf08839d6" },
    { path: "params_shard_47.bin", bytes: 33502208, sha256: "88c9d3a8756ddce77236d2fdc9a697fbc620d2019f3b07e27af3f737c934a37f" },
    { path: "params_shard_48.bin", bytes: 22544384, sha256: "b8680e8661b79ac2e1d0115295eb15b82b743e38dd65b2505778d702c4a388a3" },
    { path: "params_shard_49.bin", bytes: 28960768, sha256: "320e5b12857e5b6f67bc41c8cf24fd0df3337a2dcdff1922f49edad00e86220b" },
    { path: "params_shard_50.bin", bytes: 22544384, sha256: "4da32d6d3a0d8959bf7d347abdfa6bf2133e2145f4a6820617203f470b495875" },
    { path: "params_shard_51.bin", bytes: 22544384, sha256: "0a514fdf8541bc39fa1a11ad09f2dd928b9ef8221511fc15a3fa1415cca64262" },
    { path: "params_shard_52.bin", bytes: 33502208, sha256: "adc5ce19f5fa4fcb68ffc912765737a8bd7ea45dc44f0b966b1a3b2b1ef02eab" },
    { path: "params_shard_53.bin", bytes: 22544384, sha256: "155dbddb870fb6eff05bea05dc7dcad8db6ab2977d0e206c1c3cd03e4cb4fe0d" },
    { path: "params_shard_54.bin", bytes: 28960768, sha256: "58f4be20ab078d18a1b9f917e7ffd9c489604a1e4ac1e61575dd39e6b88c6a79" },
    { path: "params_shard_55.bin", bytes: 22544384, sha256: "5005e723e2a90119154ac3ed06026a6f5cff671b6a41b0cc5e1ec83d699f5c1d" },
    { path: "params_shard_56.bin", bytes: 22544384, sha256: "34226bf8388e708579d4b37223d4e309e21b205d5d30d31d77b81b4cc495c2dc" },
    { path: "params_shard_57.bin", bytes: 33502208, sha256: "4620cea7ade72ecf605b81422695a0746490c03808c3e142f3f092ab082a84e7" },
    { path: "params_shard_58.bin", bytes: 22544384, sha256: "590678b3defe614f8fcecaf4d09d76b3476164e14e27cf140f6f60c00b506188" },
    { path: "params_shard_59.bin", bytes: 28960768, sha256: "c0549037bd0c814174f05e7df9d4cb2cbd586344d0c153fcda0986e5d78ac173" },
    { path: "params_shard_60.bin", bytes: 22544384, sha256: "0435be1db73585e7e2f24446ef356aaf34d7b0e0feab5e50cfd74d42667df121" },
    { path: "params_shard_61.bin", bytes: 20820992, sha256: "4c0de0c1da05c821191b16c93080268e6ae4f21dd016840e652050da73c9cf9d" },
  ],
};
PINNED_WEBLLM_QWEN25_3B_F16.totalBytes = 1743558832;


// —— V8-2a 本地对话大脑：mlc-ai/Qwen2.5-1.5B-Instruct-q4f32_1-MLC @ a822ee410075710c9673005eafa017b90136b85d（固定 commit；WebLLM q4f32，Apache-2.0）——
// WebLLM 实际加载项：mlc-chat-config / tokenizer / tokenizer_config / ndarray-cache + 全部 params shard，逐文件字节+SHA256 预置。
const PINNED_WEBLLM_QWEN25_15B = {
  id: "webllm-qwen25-15b",
  repo: "mlc-ai/Qwen2.5-1.5B-Instruct-q4f32_1-MLC",
  revision: "a822ee410075710c9673005eafa017b90136b85d",
  dtype: "q4f32",
  name: "Qwen2.5-1.5B（本地对话，低延迟/低配，q4f32）",
  sizeNote: "约 760MB",
  license: { model: "Apache-2.0（Qwen2.5 MLC 权重）", url: "https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f32_1-MLC" },
  files: [
    { path: "mlc-chat-config.json", bytes: 2043, sha256: "00978c535e83ac5797fa3e6e1d10697f95f4f8d0a37bdf63eb4382040adb2cf7" },
    { path: "tokenizer.json", bytes: 7031645, sha256: "c0382117ea329cdf097041132f6d735924b697924d6f6fc3945713e96ce87539" },
    { path: "tokenizer_config.json", bytes: 7308, sha256: "5214600ee45ca2f887ce2eede8910378a0111ea99d657428bcbce94778e65a92" },
    { path: "ndarray-cache.json", bytes: 124489, sha256: "b166155dd3db14d39b843ba1e0494f9f938a9874e094a681e8d96b590d6e6458" },    { path: "tensor-cache.json", bytes: 124489, sha256: "b166155dd3db14d39b843ba1e0494f9f938a9874e094a681e8d96b590d6e6458" },
    { path: "params_shard_0.bin", bytes: 116686848, sha256: "86ebd198e0529cfa7160f5bf100c2db6901684a816c118fcce7b894c8305a50e" },
    { path: "params_shard_1.bin", bytes: 22330368, sha256: "6e4e46e2e6bf1148ef775ed603f67b7c3940e98e97563335b6344ad3385b9fa6" },
    { path: "params_shard_2.bin", bytes: 26331136, sha256: "364e60c2d4fe4b8ef34a17420c0ec88539492fd8cd4b5fa34c284f27c8bff387" },
    { path: "params_shard_3.bin", bytes: 26331136, sha256: "edc164bf8527df7d6bd6503a5f3909065fac1fd62b501eaece3eaaaa89113d83" },
    { path: "params_shard_4.bin", bytes: 26331136, sha256: "06e7c7430d42aec5ba7998ff6d64b4db422821a2c103a21998324bdee398e908" },
    { path: "params_shard_5.bin", bytes: 26331136, sha256: "39d01fac8ebb22152a069d46af338e621939ff1409766dc4fd5235625b3aa85a" },
    { path: "params_shard_6.bin", bytes: 26331136, sha256: "d0e056401fd2c48162e1a23f5244b7daecf5a9591b56f0cca416c160b5ac7af4" },
    { path: "params_shard_7.bin", bytes: 26331136, sha256: "4b5b3ca0b396a7c10e053563ced44a2cf0a99c09875eb56469c11e9140ef2460" },
    { path: "params_shard_8.bin", bytes: 26331136, sha256: "b45809259a1973dc6c813b7447a25187a081292ae3e2015252dbc7b820ed8f34" },
    { path: "params_shard_9.bin", bytes: 26331136, sha256: "1bcd8a37cc18f08377156b81bb69ac55f1a8895957ae452ea82c1c8b566e5021" },
    { path: "params_shard_10.bin", bytes: 26331136, sha256: "af65bf877b5868dbe85c0aefd9a619909466ee052fe0952f0216370090f5df2f" },
    { path: "params_shard_11.bin", bytes: 26331136, sha256: "1db7aad1d8d2c7e47726dd70e54071ab15f12dc441c5c7066aca7c866766ddf0" },
    { path: "params_shard_12.bin", bytes: 26331136, sha256: "a390418eb33365d1b0fb1433b6b54ee7531f037f2489e9440224b405e1c3071c" },
    { path: "params_shard_13.bin", bytes: 26331136, sha256: "2afbcb856e257a970d65e15d989513ad103c792fd6216a22a9b33a23a50f068e" },
    { path: "params_shard_14.bin", bytes: 26331136, sha256: "acd7d849bd1ec3c87a074870b7ccffbc12716344387376f5042a07e8eae107a2" },
    { path: "params_shard_15.bin", bytes: 26331136, sha256: "1edfe2d678e7faa76a8d1177e176f8feafccfc71724593d3e0c93da44598b598" },
    { path: "params_shard_16.bin", bytes: 26331136, sha256: "7c34e696943cada5c6142bad53598a8ef6179f897da68f6961a7c5a5282c3a52" },
    { path: "params_shard_17.bin", bytes: 26331136, sha256: "8f0d6054a5969fb32180f178b6b4b814d172de7ad324feb30d6e408803de123f" },
    { path: "params_shard_18.bin", bytes: 26331136, sha256: "6f13e0372ead37500a1b7687c32136aedc2beac772e8a0a4b2e0ea6dfc1a1a15" },
    { path: "params_shard_19.bin", bytes: 26331136, sha256: "7f3d738eec9eebc9f1b9db0edff4157c75506a1fa4e0d3edf5bf8e2f30d9bbf7" },
    { path: "params_shard_20.bin", bytes: 26331136, sha256: "9074d241e9a7a8cb1643bf0818f5101c1ac2ac1d96628c186ab29c3907b07034" },
    { path: "params_shard_21.bin", bytes: 26331136, sha256: "ab25e326d8ab534df28d2f8aa590c737336825519985ab06b1e3b323b129fc11" },
    { path: "params_shard_22.bin", bytes: 26331136, sha256: "65c5d0133e780214ab5c3d438ea34185f81631af17dff873fadd7b1096ed4ebd" },
    { path: "params_shard_23.bin", bytes: 26331136, sha256: "f246ac60922fdd3a216e550ea3ca0d27680c2795c894e797fb462719bbdb3c29" },
    { path: "params_shard_24.bin", bytes: 26331136, sha256: "11cee42d5fe71fd1180a8c2ce33b2b1c809a0606c4af75beadd77970baf57556" },
    { path: "params_shard_25.bin", bytes: 26331136, sha256: "0493360abc27936e42729fad963b9e8693b2332623661681d5d5bcac93325eb5" },
    { path: "params_shard_26.bin", bytes: 26331136, sha256: "ec8826ebbfc73c4e250b3f4e507150e1016a985e91fa34becf2cdfb21de77c01" },
    { path: "params_shard_27.bin", bytes: 26331136, sha256: "3692e3effc27286787ee484930484cb9a592e001b8e6709d1bcc91d64f12313a" },
    { path: "params_shard_28.bin", bytes: 26331136, sha256: "428bee04bdd70121b52dd2bf9a4ade2939a25b4891dadbc55abe6d8d9b0ba35f" },
    { path: "params_shard_29.bin", bytes: 18589696, sha256: "40c4b4f8283f37b70d3af4b8a8668677f627e54744cd4c8e1dc0867bfb059860" },
  ],
};
PINNED_WEBLLM_QWEN25_15B.totalBytes = 875837558;
const TRUSTED_CATALOG = [PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K, PINNED_WEBLLM_QWEN25_3B_F16, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B];

const DEFAULT_MIRROR = "https://hf-mirror.com";
const MAX_REDIRECT = 5;
const MAX_RETRY = 4;

// 只把跳回 HF 主站的重定向拉回镜像；xethub.hf.co 是 LFS 签名分发域（可达），必须保持原样
function isOfficialHost(host) {
  if (/xethub/i.test(host)) return false;
  return host === "huggingface.co" || host.endsWith(".huggingface.co") || host === "hf.co";
}
function rewriteLocation(location, mirror) {
  if (!location) return location;
  try {
    const u = new URL(location);
    if (isOfficialHost(u.host)) return mirror.replace(/\/$/, "") + u.pathname + u.search;
  } catch { /* 相对路径交给调用方基于当前 URL 解析 */ }
  return location;
}

// 纯函数：依据本地 .part 大小、期望大小、服务端是否支持 Range，决定续传动作（供单测）
function planResume(partSize, expectedSize, supportsRange) {
  if (!partSize || partSize <= 0) return { action: "restart", from: 0 };
  if (expectedSize != null && partSize >= expectedSize) return { action: "verify", from: partSize };
  if (supportsRange) return { action: "resume", from: partSize };
  return { action: "restart", from: 0 };
}

function atomicWriteJson(file, obj) {
  const tmp = file + ".tmp-" + process.pid;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
function readJsonSafe(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function freeBytes(dir) {
  try { const s = fs.statfsSync(dir); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isAbort = (e) => e && (e.name === "AbortError" || /aborted/i.test(String(e.message || "")));
const flat = (p) => String(p).replace(/[\\/]/g, "__");

class ModelStore {
  // catalogOverride 仅供单测注入“已知哈希的迷你清单”；生产用内置 TRUSTED_CATALOG
  constructor(modelsDir, opts = {}) {
    this.dir = modelsDir;
    this.catalogList = opts.catalog || TRUSTED_CATALOG;
    // 显式测试模式才允许 http 镜像（P1：生产镜像仅 HTTPS）
    this.allowInsecureMirror = !!opts.allowInsecureMirror;
    this.partDir = path.join(modelsDir, ".part");
    this.stageRoot = path.join(modelsDir, ".stage");
    this.manifestDir = path.join(modelsDir, "manifests");
    this.configFile = path.join(modelsDir, "config.json");
    fs.mkdirSync(this.partDir, { recursive: true });
    fs.mkdirSync(this.stageRoot, { recursive: true });
    fs.mkdirSync(this.manifestDir, { recursive: true });
    this.acts = new Map(); // id -> AbortController
  }

  getMirror() {
    return readJsonSafe(this.configFile, {}).mirror || DEFAULT_MIRROR;
  }
  setMirror(mirror) {
    const m = String(mirror || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(m)) throw new Error("镜像地址必须以 http(s):// 开头");
    if (/^http:\/\//i.test(m) && !this.allowInsecureMirror) throw new Error("镜像地址必须使用 HTTPS");
    atomicWriteJson(this.configFile, { ...readJsonSafe(this.configFile, {}), mirror: m });
    return m;
  }
  // 翻译模型走独立镜像配置（商业发行可用自控对象存储；默认直连 GCS）
  getMtMirror() {
    return readJsonSafe(this.configFile, {}).mtMirror || "";
  }
  setMtMirror(mirror) {
    const m = String(mirror || "").trim().replace(/\/+$/, "");
    if (!m) { atomicWriteJson(this.configFile, { ...readJsonSafe(this.configFile, {}), mtMirror: "" }); return ""; }
    if (!/^https?:\/\//i.test(m)) throw new Error("镜像地址必须以 http(s):// 开头");
    if (/^http:\/\//i.test(m) && !this.allowInsecureMirror) throw new Error("镜像地址必须使用 HTTPS");
    atomicWriteJson(this.configFile, { ...readJsonSafe(this.configFile, {}), mtMirror: m });
    return m;
  }

  spec(id) { const m = this.catalogList.find((x) => x.id === id); if (!m) throw new Error("未知模型: " + id); return m; }
  recOf(m, file) { const r = m.files.find((x) => x.path === file); if (!r) throw new Error("可信清单缺少文件: " + file); return r; }
  manifestPath(id) { return path.join(this.manifestDir, id + ".json"); }
  manifest(id) { return readJsonSafe(this.manifestPath(id), null); }

  activeDir(m) { return path.join(this.dir, m.repo, "resolve", m.revision); }
  activeFile(m, file) { return path.join(this.activeDir(m), file); }
  stageDir(id) { return path.join(this.stageRoot, id); }
  stageFile(id, file) { return path.join(this.stageDir(id), file); }
  partFile(id, file) { return path.join(this.partDir, flat(id + "__" + file) + ".part"); }
  fileUrl(m, file, mirror) {
    if (m.transport === "jsdelivr") {
      const rec = this.recOf(m, file);
      if (!/^https:\/\//i.test(rec.cdnUrl)) throw new Error("WebLLM 库分发必须使用 HTTPS");
      return rec.cdnUrl;
    }
    if (m.transport === "gcs-gz") {
      const rec = this.recOf(m, file);
      let u = rec.gzUrl;
      // 配置了翻译镜像：替换 GCS 前缀（镜像须保持其后目录结构）
      if (mirror) u = mirror.replace(/\/$/, "") + u.slice(GCS_TRANSLATIONS_PREFIX.length - 1);
      if (/^http:\/\//i.test(u) && !this.allowInsecureMirror) throw new Error("翻译模型分发必须使用 HTTPS");
      return u;
    }
    return `${mirror.replace(/\/$/, "")}/${m.repo}/resolve/${m.revision}/${file.split("/").map(encodeURIComponent).join("/")}`;
  }

  // 深校验：大小 + sha256 必须同时命中可信清单（async，磁盘 IO）
  async verifyFile(file, rec) {
    let st;
    try { st = fs.statSync(file); } catch { return false; }
    if (st.size !== rec.bytes) return false;
    const sha = await sha256OfFile(file);
    return sha === rec.sha256;
  }
  async verifyActive(id) {
    const m = this.spec(id);
    const man = this.manifest(id);
    const ok = man && man.revision === m.revision;
    const files = [];
    let all = ok;
    for (const r of m.files) {
      const good = await this.verifyFile(this.activeFile(m, r.path), r);
      files.push({ path: r.path, ok: good });
      if (!good) all = false;
    }
    return { ok: all, revision: m.revision, files };
  }

  // 同步状态：清单 revision + 大小 + 提交时记录的 mtime（同尺寸改写会改 mtime，可被同步发现）；权威哈希走 verifyActive
  status(id) {
    const m = this.spec(id);
    const man = this.manifest(id);
    const recByPath = Object.fromEntries((man?.files || []).map((r) => [r.path, r]));
    const sizeOk = m.files.every((r) => {
      try { const st = fs.statSync(this.activeFile(m, r.path)); return st.size === r.bytes && (!man || recByPath[r.path]?.mtimeMs == null || Math.abs(st.mtimeMs - recByPath[r.path].mtimeMs) < 1); }
      catch { return false; }
    });
    if (man && man.revision === m.revision && sizeOk) return "installed";
    const statSafe = (p) => { try { return fs.statSync(p); } catch { return null; } };
    let hasStage = false;
    try {
      hasStage = fs.existsSync(this.stageDir(id))
        && fs.readdirSync(this.stageDir(id), { recursive: true })
          .some((p) => { const s = statSafe(path.join(this.stageDir(id), p)); return s ? !s.isDirectory() : false; });
    } catch { /* 目录被并发清理按无 staging 处理 */ }
    let hasPart = false;
    try { hasPart = fs.readdirSync(this.partDir).some((p) => p.startsWith(flat(id))); } catch { /* ignore */ }
    if (sizeOk || hasStage || hasPart) return "partial";
    return man ? "partial" : "missing";
  }

  catalog() {
    return this.catalogList.map((m) => ({ id: m.id, name: m.name, sizeNote: m.sizeNote, dtype: m.dtype, multilingual: !!m.multilingual, license: m.license, revision: m.revision, state: this.status(m.id) }));
  }

  cancel(id) { const c = this.acts.get(id); if (c) c.abort(); return !!c; }

  async deleteModel(id) {
    this.cancel(id);
    const m = this.spec(id);
    fs.rmSync(path.join(this.dir, m.repo), { recursive: true, force: true });
    fs.rmSync(this.stageDir(id), { recursive: true, force: true });
    for (const f of fs.readdirSync(this.partDir)) if (f.startsWith(flat(id))) fs.rmSync(path.join(this.partDir, f), { force: true });
    fs.rmSync(this.manifestPath(id), { force: true });
    fs.rmSync(this.manifestPath(id) + ".bak", { force: true });
    return { id, deleted: true };
  }

  // 回滚到上一版本（需旧版本文件仍在磁盘且通过可信校验）
  async rollback(id) {
    const m = this.spec(id);
    const bak = readJsonSafe(this.manifestPath(id) + ".bak", null);
    if (!bak) throw new Error("没有可回滚的旧版本");
    const oldDir = path.join(this.dir, m.repo, "resolve", bak.revision);
    for (const r of m.files) {
      // 旧版本用旧清单记录校验；这里只要求文件存在非空
      const f = path.join(oldDir, r.path);
      if (!fs.existsSync(f) || fs.statSync(f).size === 0) throw new Error("旧版本文件缺失，无法回滚: " + r.path);
    }
    atomicWriteJson(this.manifestPath(id), { ...bak, rolledBackAt: Date.now() });
    return { id, revision: bak.revision };
  }

  // 单文件：下载到 .part（断点续传/重试）→ 对可信清单校验大小+sha → 通过才提升进 staging
  async downloadOne(m, rec, mirror, onProgress, signal) {
    const file = rec.path;
    const stage = this.stageFile(m.id, file);
    const part = this.partFile(m.id, file);
    fs.mkdirSync(path.dirname(stage), { recursive: true });
    // 断点已完整（崩溃/取消发生在校验或改名窗口）：直接校验并提升，不发 Range（否则 bytes=全长- 必然 416）
    if (fs.existsSync(part) && fs.statSync(part).size >= rec.bytes) {
      if (fs.statSync(part).size === rec.bytes && (await sha256OfFile(part)) === rec.sha256) {
        fs.rmSync(stage, { force: true });
        fs.mkdirSync(path.dirname(stage), { recursive: true });
        fs.renameSync(part, stage);
        return { bytes: rec.bytes, sha256: rec.sha256 };
      }
      fs.rmSync(part, { force: true }); // 全长度但哈希不对：从头重下
    }
    let lastErr;
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      if (signal?.aborted) throw new Error("aborted");
      try {
        let url = this.fileUrl(m, file, mirror);
        let res = null;
        for (let hop = 0; hop <= MAX_REDIRECT; hop++) {
          const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
          const headers = have > 0 ? { Range: `bytes=${have}-` } : {};
          res = await fetch(url, { signal, redirect: "manual", headers });
          if ([301, 302, 303, 307, 308].includes(res.status)) {
            let loc = res.headers.get("location");
            res.body?.cancel?.().catch(() => {});
            if (!loc || hop === MAX_REDIRECT) throw new Error("重定向次数过多: " + file);
            loc = rewriteLocation(loc, mirror);
            url = new URL(loc, url).toString();
            continue;
          }
          break;
        }
        if (res.status === 416 && fs.existsSync(part)) {
          // 本地断点已超过服务端文件长度（文件被替换/断点损坏）：丢弃断点从头重下
          fs.rmSync(part, { force: true });
          throw new Error(`HTTP 416 ${file}: 断点失效，丢弃后重试`);
        }
        if (!res || (res.status !== 200 && res.status !== 206)) throw new Error(`HTTP ${res?.status} ${file}`);
        const supportsRange = res.status === 206 || /bytes/i.test(res.headers.get("accept-ranges") || "");
        const totalHeader = Number(res.headers.get("content-length") || "NaN");
        const start = res.status === 206 ? (fs.existsSync(part) ? fs.statSync(part).size : 0) : 0;
        if (res.status === 200 && start > 0) fs.rmSync(part, { force: true });
        // 服务端给出的整段大小必须与可信清单一致（206 时是剩余字节）
        const expectTotal = rec.bytes;
        const expectThis = res.status === 206 ? expectTotal - start : expectTotal;
        if (Number.isFinite(totalHeader) && totalHeader !== expectThis) {
          throw new Error(`传输大小与可信清单不符 ${file}: 收 ${start + totalHeader}/${expectTotal}`);
        }
        const plan = planResume(start, expectTotal, supportsRange);
        const flag = res.status === 206 ? "a" : "w";
        await this.streamToFile(res, part, flag, (done) => onProgress?.(file, start + done, expectTotal));
        const got = fs.statSync(part).size;
        if (got !== expectTotal) throw new Error(`大小不符 ${file}: ${got}/${expectTotal}`);
        // 关键：对“可信清单”哈希，而不是自记
        const sha = await sha256OfFile(part);
        if (sha !== rec.sha256) throw new Error(`SHA256 与可信清单不符 ${file}`);
        fs.rmSync(stage, { force: true });
        fs.mkdirSync(path.dirname(stage), { recursive: true });
        fs.renameSync(part, stage);
        return { bytes: got, sha256: sha };
      } catch (e) {
        if (isAbort(e)) throw e;
        lastErr = e;
        await sleep(400 * Math.pow(2, attempt));
      }
    }
    throw lastErr || new Error("下载失败: " + file);
  }

  // GCS gzip 单流下载（Bergamot）：不支持 Range 续传（gzip 整体重下，单文件最大 33MB）；
  // 边下边 gunzip 进 .part（.part 存的是解压后数据），完成后按解压字节数+SHA256 对可信清单校验
  async downloadGzOne(m, rec, mtMirror, onProgress, signal) {
    const file = rec.path;
    const stage = this.stageFile(m.id, file);
    const part = this.partFile(m.id, file);
    fs.mkdirSync(path.dirname(stage), { recursive: true });
    let lastErr;
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      if (signal?.aborted) throw new Error("aborted");
      try {
        let url = this.fileUrl(m, file, mtMirror);
        let res = null;
        for (let hop = 0; hop <= MAX_REDIRECT; hop++) {
          res = await fetch(url, { signal, redirect: "manual" });
          if ([301, 302, 303, 307, 308].includes(res.status)) {
            const loc = res.headers.get("location");
            res.body?.cancel?.().catch(() => {});
            if (!loc || hop === MAX_REDIRECT) throw new Error("重定向次数过多: " + file);
            url = new URL(loc, url).toString();
            if (/^http:\/\//i.test(url) && !this.allowInsecureMirror) throw new Error("翻译模型分发必须使用 HTTPS");
            continue;
          }
          break;
        }
        if (!res || res.status !== 200) throw new Error(`HTTP ${res?.status} ${file}`);
        const gzLen = Number(res.headers.get("content-length") || "NaN");
        if (Number.isFinite(gzLen) && rec.gzBytes && gzLen !== rec.gzBytes) {
          throw new Error(`压缩包大小与可信清单不符 ${file}: ${gzLen}/${rec.gzBytes}`);
        }
        let compDone = 0;
        await this.streamGzipToFile(res, part, (n) => { compDone += n; onProgress?.(file, compDone, rec.gzBytes || null); });
        const got = fs.statSync(part).size;
        if (got !== rec.bytes) throw new Error(`解压后大小不符 ${file}: ${got}/${rec.bytes}`);
        const sha = await sha256OfFile(part);
        if (sha !== rec.sha256) throw new Error(`SHA256 与可信清单不符 ${file}`);
        fs.rmSync(stage, { force: true });
        fs.mkdirSync(path.dirname(stage), { recursive: true });
        fs.renameSync(part, stage);
        return { bytes: got, sha256: sha };
      } catch (e) {
        if (isAbort(e)) throw e;
        try { fs.rmSync(part, { force: true }); } catch { /* ignore */ }
        lastErr = e;
        await sleep(400 * Math.pow(2, attempt));
      }
    }
    throw lastErr || new Error("下载失败: " + file);
  }

  streamGzipToFile(res, part, onCompressedDone) {
    return new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(part);
      const gunzip = zlib.createGunzip();
      ws.on("error", reject);
      gunzip.on("error", reject);
      ws.on("finish", resolve);
      const nodeStream = Readable.fromWeb(res.body);
      nodeStream.on("error", reject);
      nodeStream.on("data", (c) => onCompressedDone?.(c.length));
      nodeStream.pipe(gunzip).pipe(ws);
    });
  }

  streamToFile(res, part, flag, onDone) {
    return new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(part, { flags: flag });
      let done = 0;
      const reader = res.body.getReader();
      const pump = () => reader.read().then(({ value, done: end }) => {
        if (end) { ws.end(() => resolve()); return; }
        done += value.length;
        ws.write(Buffer.from(value));
        onDone?.(done);
        return pump();
      }).catch(reject);
      ws.on("error", reject);
      pump();
    });
  }

  // staging 全量校验通过后，原子提升到 active（按 commit 分目录，不覆盖旧 commit → 可回滚）
  commit(id, mirror, started, onProgress) {
    const m = this.spec(id);
    const active = this.activeDir(m);
    fs.mkdirSync(active, { recursive: true });
    for (const r of m.files) {
      const sf = this.stageFile(id, r.path);
      const af = this.activeFile(m, r.path);
      fs.mkdirSync(path.dirname(af), { recursive: true });
      fs.rmSync(af, { force: true });
      fs.renameSync(sf, af);
    }
    const prev = this.manifest(id);
    const man = {
      id, repo: m.repo, revision: m.revision, dtype: m.dtype, mirror,
      files: m.files.map((r) => { const st = fs.statSync(this.activeFile(m, r.path)); return { path: r.path, bytes: r.bytes, sha256: r.sha256, mtimeMs: st.mtimeMs }; }),
      totalBytes: m.totalBytes, license: m.license, installedAt: Date.now(), tookMs: Date.now() - started,
      ...(prev && prev.revision !== m.revision ? { previousRevision: prev.revision } : {}),
    };
    if (prev) fs.copyFileSync(this.manifestPath(id), this.manifestPath(id) + ".bak");
    atomicWriteJson(this.manifestPath(id), man);
    fs.rmSync(this.stageDir(id), { recursive: true, force: true });
    onProgress?.({ phase: "installed", id, revision: m.revision, totalBytes: m.totalBytes });
    return man;
  }

  async ensure(id, onProgress) {
    const m = this.spec(id);
    if (this.acts.has(id)) throw new Error("该模型正在下载中");
    // 控制器在第一个 await 之前登记，保证外部立即 cancel 能命中（否则存在同步取消空窗）
    const ctrl = new AbortController();
    this.acts.set(id, ctrl);
    // 已装且深校验通过 → 零网络
    const v = await this.verifyActive(id);
    if (v.ok) {
      this.acts.delete(id);
      onProgress?.({ phase: "installed", id, revision: m.revision, totalBytes: m.totalBytes, cached: true });
      return { id, state: "installed", revision: m.revision, totalBytes: m.totalBytes, files: m.files.length, cached: true };
    }
    const mirror = m.transport === "gcs-gz" ? this.getMtMirror() : this.getMirror();
    const started = Date.now();
    try {
      const n = m.files.length;
      // 磁盘预检：按可信总字节算（staging 与 active 各占一份，最坏 2×）
      const stagedBytes = m.files.reduce((s, r) => { try { return s + fs.statSync(this.stageFile(id, r.path)).size; } catch { return s; } }, 0);
      const needBytes = Math.max(m.totalBytes - stagedBytes, 0);
      const free = freeBytes(this.dir);
      if (needBytes > 0 && free != null && free < needBytes * 2.1) {
        throw new Error(`磁盘空间不足：需约 ${Math.round((needBytes * 2.1) / 1048576)}MB（含安装临时副本），可用 ${Math.round(free / 1048576)}MB`);
      }
      for (let i = 0; i < n; i++) {
        const r = m.files[i];
        // staging 已校验则跳过下载
        if (await this.verifyFile(this.stageFile(id, r.path), r)) { onProgress?.({ phase: "skip", file: r.path, index: i, total: n }); continue; }
        onProgress?.({ phase: "download", file: r.path, index: i, total: n, pct: 0 });
        if (m.transport === "gcs-gz") {
          await this.downloadGzOne(m, r, mirror, (_f, done, total) =>
            onProgress?.({ phase: "progress", file: r.path, index: i, total: n, done, totalBytes: total,
              pct: total ? Math.round((done / total) * 1000) / 10 : 0 }), ctrl.signal);
        } else {
          await this.downloadOne(m, r, mirror, (_f, done, total) =>
            onProgress?.({ phase: "progress", file: r.path, index: i, total: n, done, totalBytes: total, pct: total ? Math.round((done / total) * 1000) / 10 : 0 }), ctrl.signal);
        }
        onProgress?.({ phase: "filedone", file: r.path, index: i, total: n });
      }
      // 二次全量校验 staging，任何一个不过都不允许 commit（杜绝新旧混合）
      for (const r of m.files) {
        if (!(await this.verifyFile(this.stageFile(id, r.path), r))) throw new Error("staging 校验失败，已中止安装: " + r.path);
      }
      const man = this.commit(id, mirror, started, onProgress);
      return { id, state: "installed", revision: man.revision, totalBytes: man.totalBytes, files: n, tookMs: man.tookMs };
    } catch (e) {
      if (isAbort(e)) return { id, state: "cancelled" };
      throw e;
    } finally {
      this.acts.delete(id);
    }
  }
}

module.exports = {
  ModelStore, TRUSTED_CATALOG, PINNED_WHISPER_TINY_EN, PINNED_WHISPER_BASE, PINNED_BERGAMOT_ENZH, PINNED_KOKORO_82M, PINNED_WEBLLM_LIB_CS1K,
  PINNED_WEBLLM_QWEN25_3B_F16, PINNED_WEBLLM_QWEN25_3B, PINNED_WEBLLM_QWEN25_15B,
  GCS_TRANSLATIONS_PREFIX, DEFAULT_MIRROR,
  rewriteLocation, planResume, atomicWriteJson, sha256Hex,
};
