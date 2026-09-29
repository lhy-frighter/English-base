const fs = require("fs");
const p = "D:/vibe coding/英语学习/V9-对话深化与多类型学习资产方案.md";
let s = fs.readFileSync(p, "utf8");
const NL = s.includes("\r\n") ? "\r\n" : "\n";
function mustReplace(oldStr, newStr, label) {
  if (!s.includes(oldStr)) throw new Error("NOT FOUND: " + label);
  if (s.split(oldStr).length - 1 > 1) throw new Error("NOT UNIQUE: " + label);
  s = s.replace(oldStr, newStr);
}

// 1) §4.1 改为 skip 闸门 + LLM 裁决
mustReplace(
  [
    "### 4.1 输入边界：语言检测（纯函数，零模型）",
    "",
    "- 新模块 `src/conversation/input-lang.ts`：按 CJK 字符占比判定 `en / zh / mixed`（纯函数 + 单测）。",
    "- 英文/英文为主 → 普通对话轮（现有 CORRECTION 机制不变）。",
    "- 中文/混说表达中文意图 → **\"说法教学\"轮**。",
  ].join(NL),
  [
    "### 4.1 输入边界：本地 skip 闸门 + LLM 裁决模式（源码验证做法）",
    "",
    "- 新模块 `src/conversation/tutor-gate.ts`（纯函数 + 单测），对齐 pi 的 shouldSkipCheck：只拦截 /、! 开头、代码围栏、少于 4 个内容单位（拉丁按空格分词、CJK 按字，取大值）、字母占比 <0.5、符号词占比 >0.3；不做 CJK 比例分类。",
    "- 通过闸门的输入，**模式由 LLM 在同一次调用里裁决**：系统提示词要求模型先判定 `chat / teach / skip`——纯英文意图走普通对话轮（现有 CORRECTION 机制不变）；中文或中英混说表达不出的意图 → 走「说法教学」尾块。混说、半句中文等边界情况由模型处理，不依赖阈值。",
    "- 闸门/模式判定均为纯函数与提示词行为，可离线单测。",
  ].join(NL),
  "4.1 dispatch"
);

// 2) §3 末尾加共享 DictPanel 抽取小节
mustReplace(
  "- 每个新资产默认生成两张卡（主动回忆 + 语境识别），兄弟卡互埋规则已存在，自动生效。" + NL + NL + "## 4. 对话功能深化",
  [
    "- 每个新资产默认生成两张卡（主动回忆 + 语境识别），兄弟卡互埋规则已存在，自动生效。",
    "",
    "### 3.3 工程前置：抽取共享 `<DictPanel>` 组件",
    "",
    "- 现状：词典面板（entry 状态、senses 义项、英英回退、createCard 成卡）是 `App.tsx` 内约 150 行内联 UI，阅读页与考纲页共用。",
    "- 对话气泡点词、教学面板 chips 都要复用它 → 抽成 `src/components/DictPanel.tsx`（props：word/phrase、textId、offset、compact），阅读/考纲/对话三处改为引用，行为不变；抽取前后跑既有词卡链路回归。",
    "",
    "## 4. 对话功能深化",
  ].join(NL),
  "dictpanel section"
);

// 3) §4.3 气泡点词措辞
mustReplace(
  "- **assistant 气泡内单词可点**：复用阅读页词典弹窗（释义/发音/加词卡）。",
  "- **assistant 气泡内单词可点**：复用 §3.3 的共享 `<DictPanel>`（释义/发音/加词卡）。",
  "4.3 dictpanel"
);

// 4) 任务表 #140 / #141
mustReplace(
  "| 140 | V9-2 中文兜底教学 | input-lang 检测、teach-parse、教学面板（chips 查词/发音/加复习）、英文整句 TTS 续聊、本地档降级 | 单测覆盖；真机：打中文→出说法→面板成卡→AI 续聊 |",
  "| 140 | V9-2 中文兜底教学 | tutor-gate 闸门、模式裁决提示词、teach-parse、教学面板（chips 查词/发音/加复习）、英文整句 TTS 续聊、本地档降级 | 单测覆盖；真机：打中文/混说→出说法→面板成卡→AI 续聊 |",
  "task 140"
);
mustReplace(
  "| 141 | V9-3 AI 内容点藏 | 气泡词可点加词卡、整句存 chunk、去重/相遇计数 | 真机：点词成卡、存句成 chunk、重复相遇不重建 |",
  "| 141 | V9-3 AI 内容点藏 | DictPanel 抽取（§3.3）、气泡词可点加词卡、整句存 chunk、去重/相遇计数 | 真机：点词成卡、存句成 chunk、重复相遇不重建；三处 DictPanel 行为一致 |",
  "task 141"
);

fs.writeFileSync(p, s);
console.log("v1.1 part2 applied");
