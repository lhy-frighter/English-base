const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/debrief.cjs";
let s = fs.readFileSync(tp, "utf8");
const old =
  'check("题干/答案/考点带出",\n' +
  '  wLis.stem.includes("ticket") && wLis.answer === "A" && wLis.point.includes("听力"),\n' +
  '  JSON.stringify([wLis.stem, wLis.answer, wLis.point]));';
const neu =
  'check("题干/答案/考点带出",\n' +
  '  wLis.stem.includes("man want") && wLis.answer === "A" && wLis.point.includes("听力"),\n' +
  '  JSON.stringify([wLis.stem, wLis.answer, wLis.point]));';
if (s.indexOf(old) === -1) throw new Error("anchor missing");
s = s.replace(old, neu);
fs.writeFileSync(tp, s);
console.log("fixed");
