// S10-1 core：从外置 txt 注入 insights/dayTimeline（避免模板字符串嵌套）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const anchor = "  // ============ V3 考试模式 ============";
if (s.includes("insights(rangeDays")) { console.log("skip"); }
else {
  if (!s.includes(anchor)) throw new Error("锚点缺失");
  const methods = fs.readFileSync(path.join(__dirname, "s10-1-methods.txt"), "utf8");
  s = s.replace(anchor, methods + anchor);
  fs.writeFileSync(fp, s, "utf8");
  console.log("patched");
}
