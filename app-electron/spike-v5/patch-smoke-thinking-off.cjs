const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/main.cjs";
let s = fs.readFileSync(p, "utf8");
const old = `            stream: true,
          }),
          signal: ctrl.signal,
        });
        console.log("CLOUD_SMOKE status", resp.status);`;
const neu = `            stream: true,
            thinking: { type: "disabled" },
          }),
          signal: ctrl.signal,
        });
        console.log("CLOUD_SMOKE status", resp.status);`;
if (!s.includes(old)) throw new Error("smoke payload anchor missing");
s = s.replace(old, neu);
fs.writeFileSync(p, s);
console.log("smoke thinking disabled");
