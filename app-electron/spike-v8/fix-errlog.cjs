const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/spike-v8/probe-realtime.cjs";
let s = fs.readFileSync(p, "utf8");
const old = `    log(\`[\${label}] <-\`, rec.type);`;
const neu = `    log(\`[\${label}] <-\`, rec.type);
    if (o?.type === "error") log(\`[\${label}] ERROR_DETAIL\`, JSON.stringify(o.error ?? o.data?.error ?? o).slice(0, 700));`;
if (s.indexOf(old) === -1) { console.log("ANCHOR MISSING"); process.exit(2); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log("error detail logging added");
