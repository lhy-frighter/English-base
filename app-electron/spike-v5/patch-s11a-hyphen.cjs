const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const oldStr = 'if (w.length < 5 || !w.startsWith(stem) || !DERIV.test(w)) continue;';
const newStr = 'if (w.includes("-") || w.length < 5 || !w.startsWith(stem) || !DERIV.test(w)) continue;';
if (s.includes(newStr)) console.log("skip");
else { if (!s.includes(oldStr)) throw new Error("锚点缺失"); fs.writeFileSync(fp, s.replace(oldStr, newStr), "utf8"); console.log("patched"); }
