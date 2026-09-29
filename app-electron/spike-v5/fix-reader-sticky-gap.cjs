const fs = require("fs");
const fp = "src/styles.css";
let s = fs.readFileSync(fp, "utf8");
const oldRule = `/* 阅读器顶栏冻结：滚动时退出/统计/译文开关始终可见 */
.reader-head {
  position: sticky; top: 0; z-index: 30;
  background: var(--bg, #fafaf7);
  margin: -28px -36px 16px;
  padding: 10px 36px;
  border-bottom: 1px solid var(--line, #e5e2da);
  flex-wrap: wrap; row-gap: 8px;
}`;
const newRule = `/* 阅读器顶栏冻结：滚动时退出/统计/译文开关始终可见 */
/* 不用负 margin（会与父级发生外边距折叠把顶栏顶下去）；用负 top 抵消 .main 的 28px 上内边距 */
.reader-head {
  position: sticky; top: -28px; z-index: 30;
  background: var(--bg, #fafaf7);
  margin: 0 -36px 16px;
  padding: 10px 36px 8px;
  border-bottom: 1px solid var(--line, #e5e2da);
  flex-wrap: wrap; row-gap: 8px;
}`;
if (!s.includes(oldRule)) throw new Error("old rule missing");
s = s.replace(oldRule, newRule);
fs.writeFileSync(fp, s, "utf8");
console.log("reader-head css fixed");
