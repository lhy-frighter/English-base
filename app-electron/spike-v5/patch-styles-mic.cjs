const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/styles.css";
let s = fs.readFileSync(p, "utf8");
const anchor = `.conv-cloud { grid-column: 1 / -1; padding: 18px 20px; }\r\n`;
if (!s.includes(anchor)) throw new Error("cloud style anchor missing");
const add = `.conv-asr-bar { display: flex; gap: 8px; align-items: center; padding: 9px 12px; margin-bottom: 8px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; flex-wrap: wrap; }\r\n.conv-asr-label { font-size: 12.5px; color: var(--ink-3); white-space: nowrap; }\r\n.conv-asr-bar .conv-input { flex: 1; min-width: 160px; }\r\n.mic-btn { padding: 8px 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--ink-2); font-size: 13px; cursor: pointer; white-space: nowrap; }\r\n.mic-btn:disabled { opacity: .55; cursor: default; }\r\n.mic-btn.mic-on { background: #fdecec; border-color: #f3c2c2; color: #c0392b; }\r\n`;
s = s.replace(anchor, add + anchor);
fs.writeFileSync(p, s);
console.log("mic styles added");
