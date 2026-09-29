const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/preload.cjs";
let s = fs.readFileSync(p, "utf8");

const oldBlock = `  // —— S14-1B Realtime 中继：打开 MessagePort（key 只在主进程，音频走 ArrayBuffer）——
  realtimeOpen: (opts) => new Promise((resolve, reject) => {
    const onPort = (ev) => {
      ipcRenderer.removeListener("realtime-port", onPort);
      ipcRenderer.removeListener("realtime-port-error", onErr);
      resolve(ev.ports[0]);
    };
    const onErr = (_ev, info) => {
      ipcRenderer.removeListener("realtime-port", onPort);
      ipcRenderer.removeListener("realtime-port-error", onErr);
      reject(new Error(info?.message || "中继打开失败"));
    };
    ipcRenderer.on("realtime-port", onPort);
    ipcRenderer.on("realtime-port-error", onErr);
    ipcRenderer.send("realtime-open", opts ?? {});
  }),
  importFiles: (paths) => call("importFiles", { paths }),
  pathForFile: (file) => webUtils.getPathForFile(file),
});`;

const newBlock = `  // —— S14-1B/1C Realtime 中继：Key 只在主进程；MessagePort 不能走 contextBridge
  // （跨隔离 Promise 解析会丢掉 postMessage），改用 window.postMessage 在 DOM 层转移 port ——
  realtimeOpen: (opts) => { ipcRenderer.send("realtime-open", opts ?? {}); },
  importFiles: (paths) => call("importFiles", { paths }),
  pathForFile: (file) => webUtils.getPathForFile(file),
});

// 主进程返回 port / 打开错误 → 经 window 消息转发到主世界（port 可转移、ArrayBuffer 原生可用）
ipcRenderer.on("realtime-port", (ev) => {
  window.postMessage({ __realtimePort: true }, "*", [ev.ports[0]]);
});
ipcRenderer.on("realtime-port-error", (_ev, info) => {
  window.postMessage({ __realtimePortError: true, message: info?.message || "中继打开失败" }, "*");
});`;

if (!s.includes(oldBlock)) { console.log("OLD BLOCK NOT FOUND"); process.exit(1); }
s = s.replace(oldBlock, newBlock);
fs.writeFileSync(p, s);
console.log("preload patched");
