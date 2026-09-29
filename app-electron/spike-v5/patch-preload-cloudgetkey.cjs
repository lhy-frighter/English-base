const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/preload.cjs";
let s = fs.readFileSync(p, "utf8");
const old = `  cloudClearKey: () => call("cloudClearKey"),
`;
if (!s.includes(old)) throw new Error("preload anchor missing");
s = s.replace(old, old + `  cloudGetKey: () => call("cloudGetKey"),
`);
fs.writeFileSync(p, s);
console.log("preload cloudGetKey exposed");
