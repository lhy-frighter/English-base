const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/spike-v8/probe-response-format.cjs";
let s = fs.readFileSync(p, "utf8");
const old = 'app.setPath("userData", require("node:path").join(process.env.APPDATA, "english-base-electron"));';
const neu = 'app.setPath("userData", require("node:path").join(__dirname, "..", "data", "webllm-profile"));';
if (s.indexOf(old) === -1) throw new Error("anchor missing");
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log("patched");
