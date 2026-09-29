const fs = require("fs");
const p = "D:/vibe coding/英语学习/V9-对话深化与多类型学习资产方案.md";
let s = fs.readFileSync(p, "utf8");
const NL = s.includes("\r\n") ? "\r\n" : "\n";
function mustReplace(oldStr, newStr, label) {
  if (!s.includes(oldStr)) throw new Error("NOT FOUND: " + label);
  if (s.split(oldStr).length - 1 > 1) throw new Error("NOT UNIQUE: " + label);
  s = s.replace(oldStr, newStr);
}

// 1) §2.1 词块原始数字
mustReplace(
  "- 流利语言的基本单位不是单词或抽象语法规则，而是**预制词块（chunks）**；研究估算母语者口语中 55–80% 由预制词块构成。学词块降低认知负荷、加快处理速度、听起来更地道。",
  [
    "- 流利语言的基本单位不是单词或抽象语法规则，而是**预制词块（chunks）**。原始研究数字（Erman & Warren, 2000, *Text* 20(1)）：程式语占**口语语篇 58.6%、书面语篇 52.3%**；Howarth (1998) 对书面语的估测约 40%。“50–80%” 是二手教学文章的宽泛区间，本方案以原始数字为准。学词块降低认知负荷、加快处理速度、听起来更地道。",
    "- 来源：[Erman & Warren 2000, DOI 10.1515/text.1.2000.20.1.29](https://doi.org/10.1515/text.1.2000.20.1.29)、[The Idiom Principle Revisited (2015)](https://academic.oup.com/applij/article/36/5/549/167093)",
  ].join(NL),
  "chunk stats"
);

// 2) §2.4 扩 pi-language-tutor 源码级发现
mustReplace(
  [
    "- 与本需求几乎同款，已验证的交互模式：",
    "  - **两个面板永不并出**：用学习语言写 → Writing check（错误 + 原因 + 更自然整句，用母语解释）；用母语写 → Writing tutor（自然整句译文 + 关键词 + 承载语法）。",
    "  - 教学面板产出的词**自动存为 flashcard**，FSRS 调度，Anki 式评分流。",
    "  - 教学/翻译卡片**绝不回送给 LLM**，不污染上下文、不产生 context 成本。",
    "- 来源：[pi-language-tutor](https://npm.io/package/pi-language-tutor)",
  ].join(NL),
  [
    "- 与本需求几乎同款。已把仓库（github.com/mackt/pi-language-tutor，v0.5.0）clone 到 `research/` 逐文件核对，源码级要点：",
    "  - **没有本地语言分类器**：`core.ts` 的 shouldSkipCheck 只做闸门（/、! 开头、代码围栏、少于 4 个内容单位、符号占比过半；CJK 按字计数不按空格），**模式 check/tutor/skip 由 LLM 在同一次调用的 JSON 里裁决**——混说输入远比比例阈值可靠。",
    "  - **两个面板永不并出**：用学习语言写 → Writing check；用母语写 → Writing tutor（自然整句 + 关键词 + 承载语法）。",
    "  - `flashcards.ts` 用 ts-fsrs、`enable_short_term:false`（单次评分直接到天级间隔）；落盘走 tmp+rename 原子写；mergeCards 防止「复习窗口开着时被新卡覆盖」；按词小写去重，introducedAt 控制每日新卡预算。",
    "  - tutor 的词在它的产品里自动存卡；**本方案改为用户点 chips 显式确认**（LLM 释义质量闸），不自动入库。",
    "  - 教学/翻译面板**绝不回送给 LLM**，不污染上下文。",
    "- 旁证项目 **lingo-loop**（MIT，local-first，YAML 画像 + SQLite 状态，模式一致；仓库星标 0，仅作模式佐证）：[PyPI](https://pypi.org/project/lingo-loop/)。",
  ].join(NL),
  "pi tutor section"
);

// 3) §2.5 语码转换措辞与新方案对齐
mustReplace(
  "- 语言判定必须在输入边界显式完成并打标，再进入后续处理，不能只靠提示词包裹。[Code-switching handling](https://theneuralbase.com/conversational-ai/learn/intermediate/code-switching-handling/)",
  "- 通用语码转换系统的经验是语言标签要在输入边界显式打标；本方案按 §2.4 的源码验证做法，采用"本地 skip 闸门 + LLM 同次裁决模式"，不另写比例分类器。[Code-switching handling](https://theneuralbase.com/conversational-ai/learn/intermediate/code-switching-handling/)",
  "code-switch line"
);

fs.writeFileSync(p, s);
console.log("v1.1 part1 applied");
