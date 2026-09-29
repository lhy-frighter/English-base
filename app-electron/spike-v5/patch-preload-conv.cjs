const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/preload.cjs";
let s = fs.readFileSync(p, "utf8");
const a = `  sessionClose: (sessionKey, activeMs, amount, locator) => call("sessionClose", { sessionKey, activeMs, amount, locator }),`;
const b = a + `
  // —— V8-2b 对话 ——
  convCreate: (o) => call("convCreate", o),
  convList: (limit) => call("convList", { limit }),
  convGet: (sessionKey) => call("convGet", { sessionKey }),
  convAddTurn: (o) => call("convAddTurn", o),
  convUpdateTurn: (o) => call("convUpdateTurn", o),
  convClose: (o) => call("convClose", o),`;
if (!s.includes(a)) { console.error("preload anchor missing"); process.exit(1); }
s = s.replace(a, b);
fs.writeFileSync(p, s);
console.log("preload conv entries added");
