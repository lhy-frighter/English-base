const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/styles.css";
let s = fs.readFileSync(p, "utf8");
const NL = "\r\n"; // styles.css CRLF
const css = [
  "",
  "/* ===== AssetCaptureSheet 转为练习 ===== */",
  ".cap-overlay { position: fixed; inset: 0; background: rgba(20,28,40,0.42);",
  "  display: flex; align-items: flex-end; justify-content: center; z-index: 900; }",
  ".cap-sheet { background: var(--paper,#fbf8f1); width: min(680px, 100%);",
  "  border-radius: 14px 14px 0 0; padding: 18px 22px 24px; box-shadow: 0 -10px 40px rgba(0,0,0,0.18);",
  "  max-height: 88vh; overflow-y: auto; }",
  ".cap-head { display: flex; justify-content: space-between; align-items: center;",
  "  font-size: 17px; font-weight: 700; margin-bottom: 8px; }",
  ".cap-x { border: none; background: none; font-size: 24px; line-height: 1; cursor: pointer; color: #6b7280; }",
  ".cap-source { font-size: 12px; margin-bottom: 6px; }",
  ".cap-context { font-size: 13px; line-height: 1.6; background: rgba(0,0,0,0.04);",
  "  border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }",
  ".cap-kind-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }",
  ".cap-kind { border: 1px solid #c9c2b4; background: transparent; border-radius: 999px;",
  "  padding: 5px 14px; font-size: 13px; cursor: pointer; color: #4b5563; }",
  ".cap-kind.on { background: var(--ink,#1f3a5f); color: #fff; border-color: var(--ink,#1f3a5f); }",
  ".cap-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 13px; }",
  ".cap-field > span { color: #4b5563; }",
  ".cap-field textarea, .cap-field input, .cap-field select {",
  "  border: 1px solid #d2cbbd; border-radius: 8px; padding: 8px 10px;",
  "  font: inherit; background: #fff; }",
  ".cap-inline { flex-direction: row; align-items: center; }",
  ".cap-inline > span { min-width: 64px; }",
  ".cap-inline select { flex: 1; }",
  ".cap-preview { display: flex; gap: 8px; flex-wrap: wrap; align-items: center;",
  "  border-top: 1px dashed #d2cbbd; padding-top: 12px; margin-bottom: 14px; }",
  ".cap-preview-lbl { font-size: 12px; color: #6b7280; }",
  ".cap-chip { font-style: normal; font-size: 12px; background: rgba(31,58,95,0.08);",
  "  color: var(--ink,#1f3a5f); border-radius: 6px; padding: 3px 9px; }",
  ".cap-listen { border: none; background: none; cursor: pointer; font-size: 13px; }",
  ".cap-err { color: var(--red-pen,#b3372c); font-size: 13px; margin-bottom: 10px; }",
  ".cap-result { display: flex; justify-content: space-between; align-items: center;",
  "  gap: 12px; font-size: 14px; }",
  ".cap-confirm { width: 100%; padding: 11px; font-size: 15px; }",
  ".conv-cap-row { margin-top: 4px; display: flex; justify-content: flex-end; }",
  ".conv-cap-row .ghost2 { font-size: 12px; padding: 3px 10px; }",
].join(NL);
s = s.replace(/\s*$/, "") + css + NL;
fs.writeFileSync(p, s);
console.log("capture sheet css added");
