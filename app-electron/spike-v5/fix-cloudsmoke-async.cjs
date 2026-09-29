const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/main.cjs";
let s = fs.readFileSync(p, "utf8");

const oldHead = `    if (process.env.APP_V8_CLOUD_SMOKE === "1") {
      try {
        const consent = parseConsent(core.getSetting("cloud_consent_json", ""));`;
const newHead = `    if (process.env.APP_V8_CLOUD_SMOKE === "1") {
      void (async () => {
      try {
        const consent = parseConsent(core.getSetting("cloud_consent_json", ""));`;
if (!s.includes(oldHead)) throw new Error("smoke head anchor missing");
s = s.replace(oldHead, newHead);

const oldTail = `      } catch (e) {
        console.log("CLOUD_SMOKE ERROR", e?.message || String(e));
        app.exit(3);
      }
    }
`;
const newTail = `      } catch (e) {
        console.log("CLOUD_SMOKE ERROR", e?.message || String(e));
        app.exit(3);
      }
      })();
    }
`;
if (!s.includes(oldTail)) throw new Error("smoke tail anchor missing");
s = s.replace(oldTail, newTail);

fs.writeFileSync(p, s);
console.log("cloud smoke wrapped in async IIFE");
