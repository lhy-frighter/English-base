const fs = require("fs");
const fp = "D:\\vibe coding\\英语学习\\交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const anchor = "> 更新：2026-09-23 · 版本 v2.28.1（**仪表盘热力图改造**）";
if (!s.includes(anchor)) throw new Error("anchor missing");
if (s.includes("v2.29.0")) { console.log("already"); process.exit(0); }
const block = `> 更新：2026-09-23 · 版本 v2.29.0（**精读词数口径修复**）
> - **问题**：旧版阅读会话启动时把全文总词数（ann.stats.words）当 amount，短时间多次打开同一篇会重复累计（真实库曾显示精读 25,732 词，实际活跃约 2 分钟）。
> - **新口径**：会话 amount = 本次从阅读起点**向前实际推进的词数**。打开文章时以断点续学锚点（resume_state reading 的 pi/ch）换算为词偏移基线（readBaselineRef）；滚动时按当前视口锚点实时换算词偏移，amount=当前偏移−基线（只增不回退）；打开后 500ms 对初始可见区域补计一次，不滚动也计数。
> - 新增纯函数 wordsUpToAnchor（按段累计英文词数，段内按字符 ch 截断）；会话启动 amount 改为 0。
> - **存量修复 repairReadAmounts()**（core，一次性幂等，app_settings: read_amount_repaired_v1）：旧 read 会话 amount 按活跃时间以极速扫读上限 300 wpm 封顶（正常精读远低于此）；真实库 25,732 → **333 词**。
> - 验证：副本库修复（333）+ 幂等 + 新会话语义（+150、再开只 +30，数字精确）；38 链全绿；tsc=0；vite build=0；冒烟通过（启动时对真实库执行修复）。
> - 真机闸门：打开一篇旧文章向下滚动几段 → 关闭 → 仪表盘/今日精读词数只增加本次新推进的部分，不再出现全文词数。

`;
s = s.replace(anchor, block + anchor);
fs.writeFileSync(fp, s, "utf8");
console.log("handoff v2.29.0 inserted");
