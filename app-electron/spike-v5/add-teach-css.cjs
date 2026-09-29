const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/styles.css";
let s = fs.readFileSync(p, "utf8");
if (s.indexOf(".teach-panel") >= 0) throw new Error("already patched");
const anchor = ".conv-input-bar { display: flex; gap: 10px; padding: 10px 0 4px; border-top: 1px solid var(--line); }";
if (s.indexOf(anchor) < 0) throw new Error("anchor missing");
const rules = [
  ".teach-panel { margin: 8px 0 4px; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--bg-soft, #fafafa); max-width: 560px; }",
  ".teach-head { display: flex; align-items: center; justify-content: space-between; }",
  ".teach-title { font-size: 12px; font-weight: 600; color: var(--ink-soft); }",
  ".teach-x { border: none; background: transparent; color: var(--ink-soft); font-size: 16px; cursor: pointer; line-height: 1; }",
  ".teach-sentence { margin: 6px 0 8px; }",
  ".teach-en { font-size: 14px; }",
  ".teach-zh { font-size: 12px; margin-top: 2px; }",
  ".teach-section { margin-top: 6px; }",
  ".teach-lbl { display: block; font-size: 11px; color: var(--ink-soft); margin-bottom: 4px; }",
  ".teach-chips { display: flex; flex-wrap: wrap; gap: 6px; }",
  ".teach-chip { font-size: 12px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); cursor: pointer; color: var(--ink); }",
  ".teach-chip:hover { border-color: var(--ink-soft); }",
  ".teach-grammar-list { display: flex; flex-direction: column; gap: 6px; }",
  ".teach-grammar-item { text-align: left; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; background: var(--bg); cursor: pointer; display: flex; flex-direction: column; gap: 2px; }",
  ".teach-grammar-item:hover { border-color: var(--ink-soft); }",
  ".teach-structure { font-size: 13px; }",
  ".teach-note { font-size: 11px; }",
  "",
].join("\r\n");
s = s.replace(anchor, rules + anchor);
fs.writeFileSync(p, s);
console.log("teach css added");
