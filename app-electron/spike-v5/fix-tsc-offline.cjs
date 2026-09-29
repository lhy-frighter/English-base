const fs = require("node:fs");
function patch(file, pairs) {
  let s = fs.readFileSync(file, "utf8");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error("anchor missing in " + file + ": " + a.slice(0, 60)); process.exit(1); }
    s = s.replace(a, b);
  }
  fs.writeFileSync(file, s);
}
patch("D:/vibe coding/英语学习/app-electron/src/conversation/local-engine.ts", [
  [`      req.onerror = () => resolve(null as unknown as IDBDatabase); // DB 不存在`,
   `      req.onerror = () => resolve(null as unknown as IDBDatabase); // DB 不存在`],
]);
// 实际定位 unused reject
let le = fs.readFileSync("D:/vibe coding/英语学习/app-electron/src/conversation/local-engine.ts", "utf8");
const a = `    const db: IDBDatabase = await new Promise((resolve, reject) => {`;
const b = `    const db: IDBDatabase = await new Promise((resolve) => {`;
if (!le.includes(a)) { console.error("le anchor missing"); process.exit(1); }
le = le.replace(a, b);
fs.writeFileSync("D:/vibe coding/英语学习/app-electron/src/conversation/local-engine.ts", le);

let os = fs.readFileSync("D:/vibe coding/英语学习/app-electron/src/spike-v8/offline-smoke.ts", "utf8");
const a2 = `  const OrigWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class extends OrigWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      externalAttempts++;
      log("V8OFF external_ws_blocked " + String(url));
      throw new Error("offline smoke: external websocket blocked");
    }
  };`;
const b2 = `  globalThis.WebSocket = function (url: string | URL) {
    externalAttempts++;
    log("V8OFF external_ws_blocked " + String(url));
    throw new Error("offline smoke: external websocket blocked");
  } as unknown as typeof WebSocket;`;
if (!os.includes(a2)) { console.error("ws anchor missing"); process.exit(1); }
os = os.replace(a2, b2);
fs.writeFileSync("D:/vibe coding/英语学习/app-electron/src/spike-v8/offline-smoke.ts", os);
console.log("tsc fixes applied");
