const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/preload.cjs";
let s = fs.readFileSync(p, "utf8");
const eol = s.includes("\r\n") ? "\r\n" : "\n";

const find = '  importFiles: (paths) => call("importFiles", { paths }),';
const i = s.indexOf(find);
if (i < 0) throw new Error("anchor not found");

const block = [
'  // —— S14-1B Realtime 中继：打开 MessagePort（key 只在主进程，音频走 ArrayBuffer）——',
'  realtimeOpen: (opts) => new Promise((resolve, reject) => {',
'    const onPort = (ev) => {',
'      ipcRenderer.removeListener("realtime-port", onPort);',
'      ipcRenderer.removeListener("realtime-port-error", onErr);',
'      resolve(ev.ports[0]);',
'    };',
'    const onErr = (_ev, info) => {',
'      ipcRenderer.removeListener("realtime-port", onPort);',
'      ipcRenderer.removeListener("realtime-port-error", onErr);',
'      reject(new Error(info?.message || "中继打开失败"));',
'    };',
'    ipcRenderer.on("realtime-port", onPort);',
'    ipcRenderer.on("realtime-port-error", onErr);',
'    ipcRenderer.send("realtime-open", opts ?? {});',
'  }),',
'  importFiles: (paths) => call("importFiles", { paths }),',
].join(eol);

s = s.slice(0, i) + block + s.slice(i + find.length);
fs.writeFileSync(p, s);
console.log("preload patched", fs.statSync(p).size);
