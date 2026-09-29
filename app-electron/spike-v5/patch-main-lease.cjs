const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/main.cjs";
let s = fs.readFileSync(p, "utf8");

// 1) leaseOn 声明
const declOld = `  const offlineOn = process.env.APP_V8_OFFLINE_SMOKE === "1";`;
const declNew = `  const offlineOn = process.env.APP_V8_OFFLINE_SMOKE === "1";
  const leaseOn = process.env.APP_V8_LEASE_SMOKE === "1";`;
if (!s.includes(declOld)) throw new Error("offlineOn decl anchor missing");
s = s.replace(declOld, declNew);

// 2) show 条件
const showOld = `    show: !spikeOn && !offlineOn && smokeSecs <= 0,`;
const showNew = `    show: !spikeOn && !offlineOn && !leaseOn && smokeSecs <= 0,`;
if (!s.includes(showOld)) throw new Error("show anchor missing");
s = s.replace(showOld, showNew);

// 3) loadURL
const urlOld = `  win.loadURL("app://app/index.html" + (spikeOn ? "?spike=v8" + spikeModel + spikeMode
    : offlineOn ? "?offline=v8" : ""));`;
const urlNew = `  win.loadURL("app://app/index.html" + (spikeOn ? "?spike=v8" + spikeModel + spikeMode
    : offlineOn ? "?offline=v8" : leaseOn ? "?lease=v8" : ""));`;
if (!s.includes(urlOld)) throw new Error("loadURL anchor missing");
s = s.replace(urlOld, urlNew);

// 4) console-message：V8LEASE 行透传，DONE/FATAL 退出（插在 spike 块之后）
const handlerAnchor = `  if (spikeOn) {`;
if (!s.includes(handlerAnchor)) throw new Error("spike handler anchor missing");
const leaseHandler = `  if (leaseOn) {
    win.webContents.on("console-message", (_e, level, message) => {
      if (message.startsWith("V8LEASE")) {
        console.log(message);
        if (message.includes("DONE")) app.exit(0);
        if (message.includes("FATAL")) app.exit(4);
      } else if (level >= 3) {
        console.log("V8LEASE pageerror " + message);
      }
    });
  }
`;
s = s.replace(handlerAnchor, leaseHandler + handlerAnchor);

fs.writeFileSync(p, s);
console.log("main.cjs lease mode wired");
