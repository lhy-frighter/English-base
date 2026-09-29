// 补注回收页 JSX（上一版误把 state 注释当成页面标记）
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const fp = path.join(root, "src", "App.tsx");
let s = fs.readFileSync(fp, "utf8");
const marker = "{/* ============ S11-b 漏网词回收 ============ */}";
if (s.includes(marker)) { console.log("already present"); process.exit(0); }
const anchor = `        {/* ============ 阅读：书库 ============ */}`;
if (!s.includes(anchor)) { console.error("anchor missing"); process.exit(1); }
const page = fs.readFileSync(path.join(__dirname, "recycle-page.tsx.txt"), "utf8").replace(/\s+$/, "") + "\n";
s = s.replace(anchor, page);
fs.writeFileSync(fp, s, "utf8");
console.log("page injected");
