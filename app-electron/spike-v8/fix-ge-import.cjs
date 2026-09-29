const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/grammar-engine.ts";
let s = fs.readFileSync(p, "utf8");
const old = `import {
  fnv, extractJson, normalize,
  type GrammarAnalysis, type GrammarError, type GrammarErrorType,
} from "./grammar-normalize";`;
const neu = `import {
  fnv, extractJson, normalize, type GrammarAnalysis,
} from "./grammar-normalize";`;
if (s.indexOf(old) === -1) { console.log("ANCHOR MISSING"); process.exit(2); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log("grammar-engine import cleaned");
