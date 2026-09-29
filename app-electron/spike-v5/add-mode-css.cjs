const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/styles.css";
let s = fs.readFileSync(p, "utf8");
const anchor = ".conv-input-bar { display: flex; gap: 10px; padding: 10px 0 4px; border-top: 1px solid var(--line); }";
if (s.indexOf(anchor) < 0) throw new Error("anchor missing");
if (s.indexOf(".conv-mode-row") >= 0) throw new Error("already patched");
const add = [
  ".conv-mode-row { display: flex; gap: 8px; padding: 8px 0 0; }",
  ".mode-btn { font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: var(--ink-soft); cursor: pointer; }",
  ".mode-btn:hover { border-color: var(--ink-soft); color: var(--ink); }",
  ".mode-btn.mode-on { background: var(--ink); color: var(--bg); border-color: var(--ink); }",
  "",
].join("\r\n");
s = s.replace(anchor, add + anchor);
fs.writeFileSync(p, s);
console.log("css added");
