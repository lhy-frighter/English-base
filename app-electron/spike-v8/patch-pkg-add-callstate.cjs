const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/package.json";
const j = JSON.parse(fs.readFileSync(p, "utf8"));
const add = " && node --experimental-strip-types test/call-state.ts";
if (!j.scripts.test.includes("test/call-state.ts")) {
  j.scripts.test = j.scripts.test + add;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  console.log("call-state appended to npm test");
} else console.log("already present");
