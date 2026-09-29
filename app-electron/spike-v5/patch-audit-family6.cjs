// 审计修复-6d：exBase 门控收紧——原形也零频时不信（ferreted→ferrete 脏数据）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const oldStr = `      if (a === 0 || (b > 0 && b < a)) return exBase;`;
const newStr = `      if (b > 0 && (a === 0 || b < a)) return exBase;`;
if (!s.includes(oldStr)) throw new Error("锚点缺失");
s = s.replace(oldStr, newStr);
fs.writeFileSync(fp, s, "utf8");
console.log("ok");
