const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/styles.css";
let s = fs.readFileSync(p, "utf8");
const anchor = ".conv-chat-head h2 { margin: 0; font-size: 17px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\r\n";
if (!s.includes(anchor)) throw new Error("css anchor missing");
const add = [
  ".conv-engine-seg { margin-left: auto; margin-right: 4px; }",
  ".conv-retry { display: flex; gap: 8px; margin-top: 6px; }",
  ".conv-retry button { padding: 4px 10px; font-size: 12px; }",
  "",
].join("\r\n");
s = s.replace(anchor, anchor + add);
fs.writeFileSync(p, s);
console.log("conv engine/retry css added");
