const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/local-engine.ts";
let s = fs.readFileSync(p, "utf8");
const a = `  async load(webllmId: string, onProgress?: (p: unknown) => void): Promise<void> {`;
const b = `  async load(webllmId: string, onProgress?: (p: unknown) => void, opts?: { useWebWorker?: boolean }): Promise<void> {`;
if (!s.includes(a)) { console.error("sig anchor missing"); process.exit(1); }
s = s.replace(a, b);
const a2 = `    this.engine = await webllm.CreateMLCEngine(webllmId, {
      appConfig,
      initProgressCallback: (p) => onProgress?.(p),
    });`;
const b2 = `    this.engine = await webllm.CreateMLCEngine(webllmId, {
      appConfig,
      ...(opts?.useWebWorker === false ? { useWebWorker: false } : {}),
      initProgressCallback: (p) => onProgress?.(p),
    });`;
if (!s.includes(a2)) { console.error("create anchor missing"); process.exit(1); }
s = s.replace(a2, b2);
fs.writeFileSync(p, s);
console.log("useWebWorker option added");
