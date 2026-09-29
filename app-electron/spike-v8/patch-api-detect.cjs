const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/api.ts";
let s = fs.readFileSync(p, "utf8");
if (s.indexOf("detectUsedAssets:") !== -1) { console.log("already"); process.exit(0); }
const anchor = "  conversationSummary: (sessionKey: string) => Promise<ConversationSummaryDto>;\n";
if (s.indexOf(anchor) === -1) throw new Error("anchor missing");
const add = anchor +
  "  detectUsedAssets: (p: { sessionKey: string; turnKey: string; text: string; }) =>\n" +
  "    Promise<{ asset_id: number; result: EvidenceResult; replayed: boolean; }[]>;\n";
s = s.replace(anchor, add);
fs.writeFileSync(p, s);
console.log("api patched");
