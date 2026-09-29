# 领域词包构建目录（pack-build）

分层词库的 L1 领域词包以**纯文本 seed + 构建脚本**维护，不手改 sqlite。

## 目录约定

```
pack-build/<pack-id>/
  words.txt    # 单词：word|pos|translation
  mwe.txt      # 短语：phrase|pos|translation（连字符/空格写法在标注时自动归一，不必重复）
  lemma.txt    # 词形：flexion|lemma（仅列 ECDICT 没收的屈折变形）
  build-pack.cjs
```

行格式：`#` 开头注释、空行忽略；`|` 分隔，译文里不要再加 `|`。

## 构建 cs-ai 包

```
node pack-build/cs-ai/build-pack.cjs
```

产物：`data/packs/cs-ai.sqlite`（先写 `.stage` 再原子改名，可重复执行）。
脚本会：

1. 挂载 `data/dict.sqlite` 做对照；
2. 单词若 ECDICT 已含相同中文实义（3 字以上中文片段重合）则**跳过**，避免重复义项；
3. 同词头但语义不同（如 transformer、ablation、BLEU）作为**补充义项**追加，L0 的音标/tag/频序永不被覆盖；
4. ECDICT 已有的短语直接跳过；
5. lemma 右侧必须能在词包或 ECDICT 找到，否则丢弃并告警。

词包 tag 固定为 `cs-ai`，不进入考纲牌组统计（考纲总量只查 dict.words）。

## cs-ai 包内容范围（v0.1.x）

- 深度学习/机器学习基础（优化、正则、训练范式、网络结构）；
- NLP/语言模型（tokenization、embedding、attention 家族、解码、评测）；
- 经典模型/数据集/会议缩写（BERT、GPT、WMT、BLEU、ACL/NeurIPS 等）；
- 读 CS 论文与工程文档常见的通用 CS 词汇；
- 刻意**不**给 query/key/value/head 这类常见词单独挂 ML 义（通用阅读噪声），只收短语。

人名、机构名等专有名词不进词包（阅读器显示"专有名词，不建卡"占位）。
论文里的数学记号（d_model、p_drop、log K）与 PDF 双栏抽取产生的粘连词
（lawwillneverbe 等）不属于词典问题，不在词包解决。

## 许可与来源（商业化前必须重审）

seed 为人工整理，释义参考了 Wiktionary（CC-BY-SA 4.0）与 Google ML Glossary
（CC-BY）的术语表述。当前 meta.license 标注 CC-BY-SA-4.0。
**商业发行前**需要逐条核对来源与许可，或改用可自由商用的原始词表重生成；
WordNet 英英层（L2）是另一条独立通道，不混入本包。

## 新增词包

1. 复制 `pack-build/cs-ai/` 为 `pack-build/<new-id>/`，改 seed 与 meta；
2. 输出路径改为 `data/packs/<new-id>.sqlite`；
3. Core 启动时自动挂载内置 `data/packs/*.sqlite` 与用户 `<dataDir>/packs/*.sqlite`，
   坏包跳过并告警，同名文件去重。
