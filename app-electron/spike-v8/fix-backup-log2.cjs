const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/main.cjs";
let s = fs.readFileSync(p, "utf8");
const old = `      const r = await core.dailyBackup();
      console.log("[backup]", r.action, r.file, "kept", Array.isArray(r.kept) ? r.kept.length : 0);`;
const neu = `      const r = core.dailyBackup();
      console.log("[backup]", r?.action, r?.file, "kept", Array.isArray(r?.kept) ? r.kept.length : 0);`;
if (s.indexOf(old) === -1) { console.log("ANCHOR MISSING"); process.exit(2); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log("main.cjs backup log fixed (sync-safe)");
