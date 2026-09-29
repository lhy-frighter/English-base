const fs = require("fs");
const fp = "src/App.tsx";
let s = fs.readFileSync(fp, "utf8");
const bad = '漏网词{(today?.recycle_multi ?? 0) > 0 ? " · " + (today.recycle_multi ?? 0) : ""}';
const good = '漏网词{today && today.recycle_multi > 0 ? ` · ${today.recycle_multi}` : ""}';
if (!s.includes(bad)) { console.error("anchor missing"); process.exit(1); }
fs.writeFileSync(fp, s.replace(bad, good));
console.log("fixed");
