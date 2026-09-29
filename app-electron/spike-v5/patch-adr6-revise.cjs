const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/ADR-6.md";
let s = fs.readFileSync(p, "utf8");

const titleOld = "# ADR-6：V8 对话大脑与语音架构（本地大脑 + 云端增强）";
const titleNew = "# ADR-6：V8 对话大脑与语音架构（云端优先 · 本地/云端可切换）";
if (!s.includes(titleOld)) throw new Error("title anchor missing");
s = s.replace(titleOld, titleNew);

const statusOld = `- 状态：**APPROVED WITH CONDITIONS** —— 六条约束在 V8-0/V8-1 落地并经测试/真机验证后，方可标记 **FROZEN**`;
const statusNew = `- 状态：**APPROVED WITH CONDITIONS（2026-09-24 修订）** —— 架构改为「云端优先、引擎可切换」；六条约束中云端路径在 V8-4 落地并经真机验证后，方可标记 **FROZEN**`;
if (!s.includes(statusOld)) throw new Error("status anchor missing");
s = s.replace(statusOld, statusNew);

// 在「## 背景」前插入修订记录
const bgOld = "## 背景";
if (!s.includes(bgOld)) throw new Error("background anchor missing");
const rev = [
  "## 修订记录（2026-09-24，V8-4）",
  "",
  "V8-1/V8-3 真机数据与用户实测后修订：",
  "",
  "1. **默认引擎改为云端**：本地 3B 冷启动长（冷载数百秒）、热轮次首 token p50 ~2.6s、占 ~2.5GB VRAM；云端 API（默认 GLM-4.7-Flash）无冷启动、不占本地显存，且纠错、语法/发音分析、雅思追问质量显著高于本地 3B。",
  "2. **引擎可切换、不删除本地**：Local / Cloud 实现统一 `stream/interrupt` 接口，设置页与聊天 header 可随时切换；本地引擎保留服务于断网、隐私敏感与开源发行场景。",
  "3. **产品护城河重述**：不可替代的部分是个人语言资产闭环（词卡分层、FSRS、覆盖率测评、跟读对齐、来源追踪、仪表盘），模型为可替换引擎；差异化押在资产系统与学习路径，而非「能本地跑模型」。",
  "4. **商业化成本约束**：云端 token 成本随用户量增长，免费档无 SLA、策略可能变更；商业版须将云端额度计入订阅，或支持 BYOK（用户自带 key）。",
  "5. ASR 与 TTS 在 V8-4 仍走本地；云端发音/语法深度分析、VAD 免手按对话后置。",
  "",
].join("\n");
s = s.replace(bgOld, rev + bgOld);

// 裁决第 2 条修订标注
const decOld = "2. **大脑默认本地**：V8-1 引入 WebLLM 做限时 spike（不提前锁定生产选型），模型档位由真机数据在 Qwen2.5-1.5B/3B/7B q4 中裁决。";
const decNew = "2. ~~大脑默认本地~~（2026-09-24 修订）：**大脑默认云端、本地可选，运行时可切换**；本地档位已裁决 q4f16 3B（默认）/ 1.5B（低配），云端默认 GLM-4.7-Flash。";
if (!s.includes(decOld)) throw new Error("decision 2 anchor missing");
s = s.replace(decOld, decNew);

fs.writeFileSync(p, s);
console.log("ADR-6 revised to cloud-first switchable");
