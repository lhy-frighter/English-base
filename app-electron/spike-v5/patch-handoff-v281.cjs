const fs = require("fs");
const fp = "D:\\vibe coding\\英语学习\\交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const anchor = "> 更新：2026-09-23 · 版本 v2.28.0（**#114 S12 平行文本能力测评**）";
if (!s.includes(anchor)) throw new Error("anchor missing");
if (s.includes("v2.28.1")) { console.log("already"); process.exit(0); }
const block = `> 更新：2026-09-23 · 版本 v2.28.1（**仪表盘热力图改造**）
> - 用户反馈 90 天堆叠柱拥挤丑陋。学习投入区的「四活动堆叠柱状图」整体替换为 ChatGPT/GitHub 贡献图式**学习热力图**：新组件 \`src/Heatmap.tsx\`，7 行（周一→周日）× 每周一列，顶部月份标签、左侧周一/三/五标签，支持横向滚动。
> - 格子明暗 = 当天四类主活动总分钟数，固定分档：0 / 1–14 / 15–29 / 30–59 / ≥60 分钟（同一蓝色系 5 级），悬停显示当天四类分钟与查词/成卡/翻译明细；选中格橙色描边。
> - **点击任一格 → 下方展开当天完整报告**（复用原 DrillPanel：时间线、有效日徽章、已删除标记），再点一次收起；未来日期留空、不渲染按钮。
> - 右下角图例「少 → 多」+ 分档说明。
> - 验证：tsc=0；vite build=0；冒烟通过；对真实库核验 7/30/90 三档列对齐（90 天 14 列、今日格 2026-09-23）与两个活动日数据。
> - 已知口径问题（不在本次范围）：阅读会话 amount 上报的是全文总词数，短时间内多次打开会让「精读词数」偏大（如 9-21 显示 19299 词/实际活跃约 1 分钟）；后续应按实际可见/新读词数上报。
> - 真机闸门：切到仪表盘，确认热力图外观、悬停提示、点击某天能展开/收起当天报告。

`;
s = s.replace(anchor, block + anchor);
fs.writeFileSync(fp, s, "utf8");
console.log("handoff v2.28.1 inserted");
