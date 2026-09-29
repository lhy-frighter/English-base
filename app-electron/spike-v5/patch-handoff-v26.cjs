const fs = require("fs");
const fp = "D:\\vibe coding\\英语学习\\交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const anchor = "> 更新：2026-09-22 · 版本 v2.25.1";
if (!s.includes(anchor)) throw new Error("anchor missing");
if (s.includes("v2.26.0")) { console.log("already"); process.exit(0); }
const block = `> 更新：2026-09-22 · 版本 v2.26.0（**#112 S11-c 跟读句 1/3/7 轻量复习 + 跟读台断点续学**）
> - **跟读句调度（不进 FSRS 卡池）**：migration **v12** 新表 \`shadow_sentences\`（sentence_hash UNIQUE、stage 0-3、due_at、practice_count、best_similarity、status active/graduated/dismissed、text_id/source_title、CHECK 约束、idx_shadow_due）。每次跟读台完成一次比对即调 \`shadowPractice()\`：新句→明天到期；到期当天再练→推进 3 天→7 天→出师；**未到期提前练不推进**（只刷次数/最佳匹配率）；大小写/多余空白归一为同一条；similarity 裁剪 0-100；title 为空但带 textId 时从 texts 回填，首个来源标题保留。
> - **续练入口**：今日页次级卡「跟读续练 · N 句到期」（todayBrief 新增 \`shadow_due\`）；跟读台顶部续练卡（第 x/N 句、来源、"下一句续练"/"这句不用再练"），队列推进后自动回查新到期；比对结果区显示调度提示（已记入/推进/出师）。阅读选区「送跟读」现在携带 textId，句子带来源文章。
> - **跟读台断点续学（shadow scope resume）**：目标句草稿 1.5s 防抖落盘 resume_state(scope='shadow')，卸载再存；冷启动进跟读台自动恢复上次句子（送句/续练模式优先）；不再每次回到 SAMPLE。
> - **IPC/类型**：main/preload/api.ts 新增 shadowPractice/shadowDue/shadowDismiss；TodayBrief.shadow_due；ShadowDueItem/ShadowPracticeResult 类型。
> - **验证**：新链 \`s11-shadow-review.cjs\` **26 断言**（调度全周期/提前练不推进/出师不复活/归一/dismiss/来源回填/todayBrief/shadow resume/裁剪）；s9-contract、text-sources、mt-cache、shadow-note 的版本断言同步到 12（含 v11+v12 重入路径）；**37 链全绿**；tsc=0；vite build=0；隐藏冒烟通过，真实库已迁移到 user_version=12。
> - 真机闸门（需用户）：跟读一句确认调度提示；今日卡点续练走完队列；杀进程重开跟读台句子还在。

`;
s = s.replace(anchor, block + anchor);
fs.writeFileSync(fp, s, "utf8");
console.log("handoff v2.26.0 inserted");
