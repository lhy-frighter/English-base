const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/main.tsx";
let s = fs.readFileSync(p, "utf8");
const a = `if (new URLSearchParams(location.search).get("spike") === "v8") {
  import("./spike-v8/run-spike")
    .then((m) => m.run())
    .catch((e) => console.log("V8SPIKE FATAL " + (e?.message || String(e))));
} else {`;
const b = `const params = new URLSearchParams(location.search);
if (params.get("spike") === "v8") {
  import("./spike-v8/run-spike")
    .then((m) => m.run())
    .catch((e) => console.log("V8SPIKE FATAL " + (e?.message || String(e))));
} else if (params.get("offline") === "v8") {
  import("./spike-v8/offline-smoke");
} else {`;
if (!s.includes(a)) { console.error("main.tsx anchor missing"); process.exit(1); }
s = s.replace(a, b);
fs.writeFileSync(p, s);
console.log("offline branch added to main.tsx");
