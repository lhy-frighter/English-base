const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/s9-contract.cjs";
let s = fs.readFileSync(tp, "utf8");
const old = 'check("user_version=14", db.prepare("PRAGMA user_version").get().user_version === 14);';
const neu = 'check("user_version=15", db.prepare("PRAGMA user_version").get().user_version === 15);';
if (s.indexOf(old) === -1) throw new Error("anchor missing");
s = s.replace(old, neu);
fs.writeFileSync(tp, s);
console.log("fixed");
