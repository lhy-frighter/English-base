const fs = require("node:fs");

// 1) main.cjs：注册 conv* IPC
const mp = "D:/vibe coding/英语学习/app-electron/main.cjs";
let m = fs.readFileSync(mp, "utf8");
const a = `      sessionClose: ({ sessionKey, activeMs, amount, locator }) =>
        core.closeSession(sessionKey, { activeMs, amount, locator }),`;
const b = a + `
      // —— V8-2b 对话会话/轮次 ——
      convCreate: (o) => core.convCreate(o),
      convList: ({ limit }) => core.convList(limit),
      convGet: ({ sessionKey }) => core.convGet(sessionKey),
      convAddTurn: (o) => core.convAddTurn(o),
      convUpdateTurn: (o) => core.convUpdateTurn(o),
      convClose: (o) => core.convClose(o),`;
if (!m.includes(a)) { console.error("main anchor missing"); process.exit(1); }
m = m.replace(a, b);
fs.writeFileSync(mp, m);

// 2) core.cjs：beginSession 允许 conversation/turns
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let c = fs.readFileSync(cp, "utf8");
const pairs = [
  [`    if (kind !== "read" && kind !== "shadow") throw new Error("会话 kind 只能是 read/shadow");`,
   `    if (kind !== "read" && kind !== "shadow" && kind !== "conversation") throw new Error("会话 kind 只能是 read/shadow/conversation");`],
  [`    const unit = o.unit === "words" || o.unit === "sentences" ? o.unit : "";`,
   `    const unit = o.unit === "words" || o.unit === "sentences" || o.unit === "turns" ? o.unit : "";`],
];
for (const [x, y] of pairs) {
  if (!c.includes(x)) { console.error("core anchor missing: " + x.slice(0, 50)); process.exit(1); }
  c = c.replace(x, y);
}
fs.writeFileSync(cp, c);
console.log("conv IPC registered and beginSession allows conversation");
