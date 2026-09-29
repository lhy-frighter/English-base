const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/spike-v8/probe-realtime.cjs";
let s = fs.readFileSync(p, "utf8");
const old = `  return s.waitFor(isType("session.updated"), 15000);
}`;
const neu = `  const evt = await Promise.race([
    s.waitFor(isType("session.updated"), 15000),
    s.waitFor(isType("error"), 15000),
  ]);
  if (evt.type === "error") {
    throw new Error("session_update_error:" + JSON.stringify(evt.data.error ?? evt.data).slice(0, 300));
  }
  return evt;
}`;
if (s.indexOf(old) === -1) { console.log("ANCHOR MISSING"); process.exit(2); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log("probe session.update error handling hardened");
