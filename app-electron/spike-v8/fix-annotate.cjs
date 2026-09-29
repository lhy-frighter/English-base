const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/debrief.cjs";
let s = fs.readFileSync(tp, "utf8");
const old = 'const a = core.annotate(\n  "This benefit is clearly demonstrated. Another benefit appears here too.", "t1");';
const neu = 'const a = core.annotateAndSave(\n  "This benefit is clearly demonstrated. Another benefit appears here too.", "t1");';
if (s.indexOf(old) === -1) throw new Error("anchor missing");
s = s.replace(old, neu);
fs.writeFileSync(tp, s);
console.log("fixed");
