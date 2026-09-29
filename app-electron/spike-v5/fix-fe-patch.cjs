const fs = require("fs");
const fp = "spike-v5/patch-s11b-fe.cjs";
let s = fs.readFileSync(fp, "utf8");
const bad = "漏网词{(today?.recycle_multi ?? 0) > 0 ? ` · ${today.recycle_multi}` : \"\"}";
const good = "漏网词{(today?.recycle_multi ?? 0) > 0 ? \\` · ${today.recycle_multi}\\` : \"\"}";
if (!s.includes(bad)) { console.log("anchor missing"); process.exit(1); }
s = s.replace(bad, good);
fs.writeFileSync(fp, s);
console.log("fixed");
