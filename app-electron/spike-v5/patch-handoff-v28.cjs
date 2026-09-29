const fs = require("fs");
const fp = "D:\\vibe coding\\英语学习\\交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const anchor = "> 更新：2026-09-23 · 版本 v2.27.0";
if (!s.includes(anchor)) throw new Error("anchor missing");
if (s.includes("v2.28.0")) { console.log("already"); process.exit(0); }
const block = `> 更新：2026-09-23 · 版本 v2.28.0（**#114 S12 平行文本能力测评**）
> - **冻结测评蓝图，不冻结文章**：题库 \`data/assessment-bank.json\` 含 2 个蓝图（B2 综合 / C1 学术）× 3 份平行卷（复用 6 篇 builtin 正文），每份随文附带 4 道四选一理解题（共 24 题，含答案与依据段）。
> - **流程**：选等级（按当前水平）→ 系统随机下发一篇从未用过的平行卷 → 阅读（活跃计时，仅页面可见时累计；点词查词、整段机翻逐次计数）→ 读完答 4 道 MC → 出分。
> - **"陌生同级材料独立理解得分"（0–100）**：理解题正确率 45% + 开卷词汇覆盖率 25% + 阅读速度 15%（20 wpm≈10 分、95 wpm 封顶）+ 少依赖 15%（100 起步，查词一次 −6、整段机翻 −10）。
> - **防练习效应/循环证明**：每份 form 全周期只准用一次（app_settings: parallel_used_forms），耗尽后诚实报错；开卷下发的题目剥掉 answer；交卷防重复提交；平行卷不进书库（text_id 为空）。结果写 coverage_assessments kind='parallel_test'，仪表盘能力趋势区顶部展示历史得分。
> - **入口**：今日页次级卡「能力测评」、仪表盘能力区「开始能力测评」按钮（覆盖式 AssessPage，不进侧栏）。
> - **验证**：新链 test/s12-assessment.cjs **27 断言**（蓝图/开卷/满分卷/落库/历史/重复提交拒绝/三卷耗尽/C1/零计时）；**38 链全绿**；tsc=0；vite build=0；冒烟通过。
> - 真机闸门（只能本人）：完整走一次测评——阅读时点词/翻译计数是否增长、答完题后仪表盘能力区出现得分记录。

`;
s = s.replace(anchor, block + anchor);
fs.writeFileSync(fp, s, "utf8");
console.log("handoff v2.28.0 inserted");
