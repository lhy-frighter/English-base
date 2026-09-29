const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
if (s.includes("v2.43.0")) throw new Error("already added");
const entry = [
"> 更新：2026-09-24 · 版本 v2.43.0（**#145–#147 Tutor 协议落地：真实库 v14 冒烟 + tutor-gate/TEACH + 教学成资产**）",
"> - **#145 真实库 v14 冒烟**（test/real-v14-smoke.cjs，可重入，23 checks）：真实 user.sqlite 已完成 v13→v14（迁移前自动备份 data/backups/pre-v14-*.sqlite，integrity ok）；计数无漂移、旧词卡 DTO 完整、资产卡建/字段核对/级联清理、二次实例化可重入。",
">   - 修复真实问题：cards.asset_id FK 补 ON DELETE CASCADE（migrateV14 DDL + 构造器幂等自愈 repairAssetFkCascade）；v14-migration Part B 夹具改用 pre-v14 备份（稳定 v13 夹具，无则 SKIP）。",
">   - 产品发现：新卡队列按 created_at 旧→新、每日新卡配额 NEW_PER_DAY=12；历史新卡积压时新 captureAsset 排队等待（预期，非缺陷）。",
"> - **#146 Tutor 协议片**（全程不写资产）：",
">   - src/conversation/tutor-gate.ts 纯函数：只拦空内容、/! 开头命令、代码围栏、符号噪声；短中文（怎么说？/我累了/这个呢）一律放行；提示注入不本地误杀（交系统提示词）。",
">   - src/conversation/teach-parse.ts 纯函数：尾块定位（必须在回复末尾）、JSON/字段严格校验；截断 dangling、重复块、坏 JSON、缺字段、TEACH.en 与正文不对应 → teach=null 降级普通对话。",
">   - systemPrompt 改为模型同次裁决 chat/teach（无本地分类器，pi-language-tutor 同款）；两个显式入口按钮「教我怎么说」（强制 teach）/「我只是想聊天」（强制 chat）。",
">   - 流式剥离：TEACH 不进气泡、不进 TTS（stripTeachRaw 保累计游标单调）、不进历史/上下文；用户输入的 [TEACH 永不解析（解析器只作用于模型输出）。",
"> - **#147 教学成资产片**：TutorTeachPanel（src/conversation/TutorTeachPanel.tsx）挂在 completed 助手气泡下——整句 en/zh、地道词块 chips、关键词 chips、语法点；点击任一教学点才打开 AssetCaptureSheet（新增 CapturePrefill 预填 kind/canonical/gloss/专属字段，chunk 带 example_zh），用户确认后 captureAsset 成卡；面板零写库、可关闭；AI 建议只是教学草稿，不直接写 asset_evidence；话题切换清空面板。",
"> - **验证**：全量 **47 链零失败**（新增 tutor-gate 19 checks、teach-parse 21 checks）；tsc=0；vite build=0。",
"> - **待真机闸门（用户本人）**：中文求说法（如「我想请个假怎么说」）→ 教学面板 → 点词块/词 → sheet 确认 → 复习队列出现；本地/云端各跑一轮 TEACH 稳定性；VAD 5 项真机闸门仍挂账。",
"> - **剩余挂账**：#138 云端发音/语法深度分析（只作 pronunciation/grammar 新证据来源，不改底座）；ASR 封板真机闸门。",
">",
"",
].join("\r\n");
const lines = s.split("\n");
// 在第 1 行（标题）之后插入
lines.splice(1, 0, entry);
fs.writeFileSync(p, lines.join("\n"));
console.log("handover v2.43.0 added");
