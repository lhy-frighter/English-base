const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/styles.css";
let s = fs.readFileSync(p, "utf8");
const anchor = `.conv-hist-item b { font-size: 13.5px; color: var(--ink); }\r\n.conv-hist-item span { font-size: 11.5px; color: var(--ink-3); }\r\n`;
if (!s.includes(anchor)) throw new Error("styles anchor missing");
const add = `.conv-cloud { grid-column: 1 / -1; padding: 18px 20px; }\r\n.conv-cloud h3 { margin: 0 0 8px; color: var(--ink); }\r\n.conv-cloud-note { font-size: 12.5px; margin: 0 0 10px; line-height: 1.6; }\r\n.cloud-toggle { display: flex; gap: 9px; align-items: flex-start; padding: 7px 0; font-size: 13px; color: var(--ink-2); cursor: pointer; }\r\n.cloud-toggle input { margin-top: 2px; }\r\n.cloud-key-row { display: flex; gap: 8px; align-items: center; margin-top: 6px; }\r\n.cloud-key-row .conv-input { flex: 1; }\r\n.cloud-key-row .muted { font-size: 12px; flex: 1; }\r\n`;
s = s.replace(anchor, anchor + add);
fs.writeFileSync(p, s);
console.log("styles cloud rules added");
