const fs = require("fs");
const fp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(fp, "utf8");
const oldExp = "module.exports = { Core, extractSentence, nowMs, NEW_PER_DAY, parsePaper, decodeHtmlEntities };";
const newExp = "module.exports = { Core, extractSentence, buildCloze, nowMs, NEW_PER_DAY, parsePaper, decodeHtmlEntities };";
if (s.includes("buildCloze, nowMs")) console.log("skip");
else { if (!s.includes(oldExp)) throw new Error("export anchor missing"); fs.writeFileSync(fp, s.replace(oldExp, newExp), "utf8"); console.log("exported buildCloze"); }
