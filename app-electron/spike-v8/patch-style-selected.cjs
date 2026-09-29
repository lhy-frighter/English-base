const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/styles.css";
let s = fs.readFileSync(p, "utf8");
const old = `.tcard:hover { border-color: var(--brass); transform: translateY(-1px); }`;
const neu = `.tcard:hover { border-color: var(--brass); transform: translateY(-1px); }
.tcard.selected { border-color: var(--navy); box-shadow: 0 0 0 1px var(--navy) inset; }`;
if (s.indexOf(old) === -1) { console.log("ANCHOR MISSING"); process.exit(2); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log("tcard selected style added");
