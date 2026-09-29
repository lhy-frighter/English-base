const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");
const bad = `          const esc0 = a.canonical.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\      if (row.card_type === "concept") {
        // 错题概念卡：正面=错因+考点（sense），背面=题干/解析（context_sentence）
        shown = n.sense;
      } else if (row.card_type === "cloze") {");`;
const i = s.indexOf(bad);
if (i < 0) throw new Error("bad block not found");
const good = `          const esc0 = a.canonical.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");`;
s = s.slice(0, i) + good + s.slice(i + bad.length);
fs.writeFileSync(p, s);
console.log("repaired");
