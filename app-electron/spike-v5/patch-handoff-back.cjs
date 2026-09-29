const fs = require("fs");
const fp = "D:\\vibe coding\\英语学习\\交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const oldStr = "> - **待用户目视闸门**：①今日页出现「漏网词回收」次级卡（真实库应显示 918）；";
const newStr = "> - 回收页不在侧栏，页头有「← 返回今日/词库」键，按来源（今日卡 or 词库入口）返回。\n> - **待用户目视闸门**：①今日页出现「漏网词回收」次级卡（真实库应显示 918）；";
if (s.includes("← 返回今日/词库")) { console.log("already"); process.exit(0); }
if (!s.includes(oldStr)) { console.error("anchor missing"); process.exit(1); }
fs.writeFileSync(fp, s.replace(oldStr, newStr), "utf8");
console.log("handoff updated");
