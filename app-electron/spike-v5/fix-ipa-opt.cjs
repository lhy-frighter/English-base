const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(p, "utf8");
const oldStr = `                              <span className="phon">/{String(card.payload.ipa)}/</span>}`;
const i = s.indexOf(oldStr);
if (i < 0) throw new Error("anchor missing");
s = s.slice(0, i) + `                              <span className="phon">/{String(card.payload?.ipa)}/</span>}` + s.slice(i + oldStr.length);
fs.writeFileSync(p, s);
console.log("optional chaining fixed");
