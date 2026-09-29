// 交接文档升 v2.24.0（在 v2.23.0 块前插入）
const fs = require("fs");
const fp = "D:\\vibe coding\\英语学习\\交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const anchor = "> 更新：2026-09-22 · 版本 v2.23.0";
if (!s.includes(anchor)) throw new Error("anchor missing");
if (s.includes("v2.24.0")) { console.log("already"); process.exit(0); }
const block = `> 更新：2026-09-22 · 版本 v2.24.0（**#117 二刷：全方法 fuzz 审计——功能词 exchange 家族关闭、零频动词化门控、canonical exchange 0:base 优先还原、-ly 副词还原、判分硬化**）
> - **起因**：用户要求"不只是 the 假同根这一个类型，做一个全部的检查"。方法：对 core.cjs 全方法用真实 ECDICT（40 万词）+ 内置语料 + 三份冻结 PDF 批量 fuzz，而非只看单测。诊断脚本留存 app-electron/spike-v5/diag-full1/full2/full3.cjs、diag-pdf-miss.cjs。
> - **① relatedWords 规则②（ECDICT exchange 屈折）两道门控**：(a) 功能词整体跳过——be/her/them/me/can/will/off 等经 exchange 产出 was/is/been/hering/thems/mes/cans/willing/upped 等假家族，现与规则③一致对 isFunctionLemma() 词头直接关闭；(b) 零频候选必须**在自身 exchange 里声明 0:<本词>** 才收录——started/became/happier/chairmen 这类自身带 0:start/1:pd、0:become/1:p 的合法屈折保留，而 partied/birded/warred/frenches/lowing 这类自身 exchange 为空的零频动词化/脏复数被剔除（partying/warring/birding/neighboring 因 frq>0 保留）。pushWord 全局过滤连字符成员（non-traditional 不再进 AWL 家族展示）。抽查：be/her/them/french 家族为空；become→became/becoming；start→started/starting；happy→happier/happiest/happily/happiness；chairman→chairmen；computer/finally/concept 的 -ise/-ize/computation 等 AWL 风格派生保留（零频但属权威词族，规则① AWL 仍可信）。
> - **② canonical 新增 exchangeZeroBase() 且优先级提到 lemma 映射之前**：词头自身 exchange 的 0:<base> 最权威。修复一批"lemma 表缺失或反向指向"导致的分裂：denied→deny、qualified→qualify、varied→vary、sanctified→sanctify、quarried→quarry、objectified→objectify、costed→cost、spitted→spit、tapestried→tapestry、bustier→busty（旧路径被反向垃圾带到 bustiers）、better→good、worse→bad。门控：原形 frq 必须 >0 且（表层零频直接还原，表层高频仅当原形排名更小）；原形也零频则不信（ferreted 的 exchange 误写 0:ferrete，回落到 lemma 表正确还原 ferret）。3000 个高频 0:base 词头全量复测 canonical 异常为 **0**；people/data/media/willing/neighboring 等无标记或标记错误的高频独立词保持自身。
> - **③ ruleLemma 增加 -ly 副词还原**（沿用 frq>0 硬门控）：adversarially→adversarial（frq 15137，Attention/instructgpt 论文实测 miss）。本词已在词典时（quickly/finally）不触发。frq=0 词头的复数/三单（labelers/incentivizes/evals）**仍刻意不还原**——零频词头 35.8 万且混有 worke→workes 类脏数据，放松门控会制造假词元；这类 ML 新词（reparameterization/misspecified/labeler）走领域词包机制（S2 CS-AI pack）扩展，不靠规则猜。
> - **④ 判分硬化**：answer() 校验 rating 必须为整数 1–4，非法值抛错且不写 review_log/evidence_log；setWrongReason() 概念卡创建（lexeme+note+card+回写）包进 BEGIN IMMEDIATE/COMMIT 事务，失败 ROLLBACK 零残留（与 shadow-note 事务同标准）。
> - **⑤ 全方法 fuzz 结论（无需改的部分）**：meaningChoices 600 随机词 0 抛错/0 长度错/0 重复/0 泄漏（此前 diag 报 400 throw 是诊断脚本把词行对象当中译文传入的自身 bug，生产 getDue 始终传字符串）；spelling/cloze 前端判分容错（大小写/标点/空格）正确；FSRS answer 全 rating 路径、getDue 新卡配额与兄弟卡互埋、redoWrong 1/3/7 状态机、textCefr 中位数口径（13 篇内置素材 B1/B2 合理）、会话/仪表盘聚合（s9/s10 单测覆盖）均正常；三份冻结 PDF miss 分类：attention 仅剩 3（2 人名 + lrate 排版粘连），instructgpt 283 主要是论文里的法语例句（jusqu'à/époque/grenouille…）与真领域新词，vae 16 为公式插字/源文拼写错误/reparameterization，**canonical 可救而漏救的为 0**。
> - **验证**：test/audit-heuristics.cjs 24→**42 断言**（新增功能词 exchange 家族为空、party/bird/become/start/happy/chairman 门控边界、连字符排除、denied/qualified/varied/bustier/better/ferreted/adversarially/investigated 还原、非法 rating 不写日志）；**35 链 npm test 全绿**；tsc=0；vite build=0（index js 350.96kB/gzip 111.57kB）；隐藏 Electron 冒烟 SMOKE_LOADED/SMOKE_DONE、备份正常。
> - **已知上游词典脏数据（不修，记录在案）**：neighboring 的 exchange 原形拼写为不存在的 neighbore（canonical 保持 neighboring 自身）；ferreted 误写 0:ferrete（已由门控+lemma 表兜住）；ECDICT frq 排名稀疏（started/became/happier 均 frq=0，靠"自身 exchange 自声明"门控收录家族展示，canonical 走 0:base 不受影响）。
> - **后续内容债（不属启发式层）**：labeler/incentivize/eval/reparameterize/misspecified 等 frq=0 或缺失的 ML 高频词，应在 S11 阶段扩充 CS-AI 领域词包；one/first 数词在相遇表的边界随 #111 S11-b 排序时定。

`;
s = s.replace(anchor, block + anchor);
fs.writeFileSync(fp, s, "utf8");
console.log("inserted, bytes:", s.length);
