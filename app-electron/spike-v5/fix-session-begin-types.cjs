const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/api.ts";
let s = fs.readFileSync(p, "utf8");
const x = `    kind: "read" | "shadow"; sessionKey: string; refType: string; refId: string;
    titleSnapshot?: string; locator?: Record<string, unknown>; contentHash?: string;
    amount?: number; unit?: "words" | "sentences" | "";`;
const y = `    kind: "read" | "shadow" | "conversation"; sessionKey: string; refType: string; refId: string;
    titleSnapshot?: string; locator?: Record<string, unknown>; contentHash?: string;
    amount?: number; unit?: "words" | "sentences" | "turns" | "";`;
if (!s.includes(x)) { console.error("anchor missing"); process.exit(1); }
s = s.replace(x, y);
fs.writeFileSync(p, s);
console.log("sessionBegin types widened");
