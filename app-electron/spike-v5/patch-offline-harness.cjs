const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/main.cjs";
let s = fs.readFileSync(p, "utf8");

// 1) 声明 offlineOn
const a1 = `  const spikeOn = process.env.APP_V8_SPIKE === "1";`;
const b1 = `  const spikeOn = process.env.APP_V8_SPIKE === "1";
  const offlineOn = process.env.APP_V8_OFFLINE_SMOKE === "1";`;
if (!s.includes(a1)) { console.error("a1 missing"); process.exit(1); }
s = s.replace(a1, b1);

// 2) show 条件
const a2 = `    show: !spikeOn && smokeSecs <= 0,`;
const b2 = `    show: !spikeOn && !offlineOn && smokeSecs <= 0,`;
if (!s.includes(a2)) { console.error("a2 missing"); process.exit(1); }
s = s.replace(a2, b2);

// 3) loadURL
const a3 = `  win.loadURL("app://app/index.html" + (spikeOn ? "?spike=v8" + spikeModel + spikeMode : ""));`;
const b3 = `  win.loadURL("app://app/index.html" + (spikeOn ? "?spike=v8" + spikeModel + spikeMode
    : offlineOn ? "?offline=v8" : ""));`;
if (!s.includes(a3)) { console.error("a3 missing"); process.exit(1); }
s = s.replace(a3, b3);

// 4) 在 spike 块之后插入 offline 块
const a4 = `    const spikeTimeoutMs = Number(process.env.APP_V8_SPIKE_TIMEOUT_MS || 900000);
    setTimeout(() => { console.log("V8SPIKE TIMEOUT"); app.exit(5); }, spikeTimeoutMs);
  }`;
const b4 = a4 + `
  if (offlineOn) {
    win.webContents.on("console-message", (_e, level, message) => {
      if (message.startsWith("V8OFF")) {
        console.log(message);
        if (message.includes("V8OFF DONE") || message.startsWith("V8OFF FATAL")) {
          app.exit(message.startsWith("V8OFF FATAL") ? 4 : 0);
        }
      } else if (level >= 3) {
        console.log("V8OFF pageerror " + message);
      }
    });
    win.webContents.on("render-process-gone", (_e, d) => {
      console.log("V8OFF render_gone " + JSON.stringify(d)); app.exit(3);
    });
    setTimeout(() => { console.log("V8OFF TIMEOUT"); app.exit(5); }, Number(process.env.APP_V8_OFFLINE_TIMEOUT_MS || 900000));
  }`;
if (!s.includes(a4)) { console.error("a4 missing"); process.exit(1); }
s = s.replace(a4, b4);

fs.writeFileSync(p, s);
console.log("offline harness added to main.cjs");
