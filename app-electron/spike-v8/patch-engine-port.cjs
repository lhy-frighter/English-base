const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/call/call-engine.ts";
let s = fs.readFileSync(p, "utf8");

const old = `  async start(cfg: CallEngineConfig): Promise<void> {
    const electronAPI = (window as unknown as { electronAPI: { realtimeOpen: (o?: unknown) => Promise<MessagePort> } }).electronAPI;
    this.port = await electronAPI.realtimeOpen({});
    this.player = new CallAudioPlayer();`;

const rep = `  private openRelayPort(): Promise<MessagePort> {
    return new Promise((resolve, reject) => {
      const onWinMsg = (e: MessageEvent) => {
        const d = e.data as { __realtimePort?: boolean; __realtimePortError?: boolean; message?: string } | null;
        if (d && d.__realtimePort) {
          window.removeEventListener("message", onWinMsg);
          resolve(e.ports[0]);
        } else if (d && d.__realtimePortError) {
          window.removeEventListener("message", onWinMsg);
          reject(new Error(d.message || "中继打开失败"));
        }
      };
      window.addEventListener("message", onWinMsg);
      const electronAPI = (window as unknown as { electronAPI: { realtimeOpen: (o?: unknown) => void } }).electronAPI;
      electronAPI.realtimeOpen({});
    });
  }

  async start(cfg: CallEngineConfig): Promise<void> {
    this.port = await this.openRelayPort();
    this.player = new CallAudioPlayer();`;

if (!s.includes(old)) { console.log("OLD NOT FOUND"); process.exit(1); }
s = s.replace(old, rep);
fs.writeFileSync(p, s);
console.log("call-engine patched");
