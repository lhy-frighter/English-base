const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(p, "utf8");
const oldStr = `                            {card.asset_kind === "pronunciation" && card.payload?.ipa &&
                              <span className="phon">/{String(card.payload.ipa)}/</span>}`;
const i = s.indexOf(oldStr);
if (i < 0) throw new Error("anchor missing");
const newStr = `                            {card.asset_kind === "pronunciation" && Boolean(card.payload?.ipa) &&
                              <span className="phon">/{String(card.payload.ipa)}/</span>}`;
s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
fs.writeFileSync(p, s);
console.log("ipa boolean fixed");
