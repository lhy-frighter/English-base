const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/styles.css";
let s = fs.readFileSync(p, "utf8");
const anchor = ".mic-btn.mic-on { background: #fdecec; border-color: #f3c2c2; color: #c0392b; }\r\n";
if (!s.includes(anchor)) throw new Error("css anchor not found");
const add =
  anchor +
  ".mic-pill { padding: 8px 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--ink-2); font-size: 13px; white-space: nowrap; min-width: 96px; text-align: center; }\r\n" +
  ".mic-pill.mic-pill-talk { background: #eaf4ec; border-color: #b9dcc2; color: #1e7a3d; }\r\n" +
  ".conv-hf-hint { font-size: 12.5px; padding: 4px 2px 2px; }\r\n" +
  ".conv-hf-on { background: #eaf4ec !important; border-color: #b9dcc2 !important; color: #1e7a3d !important; }\r\n";
fs.writeFileSync(p, s.replace(anchor, add));
console.log("css added");
