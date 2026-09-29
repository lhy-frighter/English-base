const fs = require("fs");
const fp = "main.cjs";
let s = fs.readFileSync(fp, "utf8");
if (s.includes("APP_V8_SPIKE")) { console.log("already"); process.exit(0); }

// 1) createWindow 内：spike 模式加载 ?spike=v8 并捕获输出
const anchor = `  Menu.setApplicationMenu(null);
  win.loadURL("app://app/index.html");`;
if (!s.includes(anchor)) throw new Error("loadURL anchor missing");
const repl = `  Menu.setApplicationMenu(null);
  const spikeOn = process.env.APP_V8_SPIKE === "1";
  win.loadURL("app://app/index.html" + (spikeOn ? "?spike=v8" : ""));
  if (spikeOn) {
    win.webContents.on("console-message", (_e, level, message) => {
      if (message.startsWith("V8SPIKE")) {
        console.log(message);
        if (message.includes("V8SPIKE DONE") || message.startsWith("V8SPIKE FATAL")) {
          try {
            const m = process.getProcessMemoryInfo ? process.getProcessMemoryInfo() : null;
            if (m) console.log("V8SPIKE mainRSS_KB " + m.residentSet);
          } catch { /* ignore */ }
          app.exit(message.startsWith("V8SPIKE FATAL") ? 4 : 0);
        }
      } else if (level >= 3) {
        console.log("V8SPIKE pageerror " + message);
      }
    });
    win.webContents.on("render-process-gone", (_e, d) => {
      console.log("V8SPIKE render_gone " + JSON.stringify(d)); app.exit(3);
    });
    const spikeTimeoutMs = Number(process.env.APP_V8_SPIKE_TIMEOUT_MS || 900000);
    setTimeout(() => { console.log("V8SPIKE TIMEOUT"); app.exit(5); }, spikeTimeoutMs);
  }`;
s = s.replace(anchor, repl);

// 2) createWindow 调用处：spike 时隐藏窗口
const a2 = `function createWindow() {
  const smokeSecs = Number(process.env.APP_SMOKE_SECONDS || 0);`;
if (!s.includes(a2)) throw new Error("createWindow anchor missing");
s = s.replace(a2, `function createWindow() {
  const spikeOn = process.env.APP_V8_SPIKE === "1";
  const smokeSecs = Number(process.env.APP_SMOKE_SECONDS || 0);`);
s = s.replace("    show: smokeSecs <= 0,", "    show: !spikeOn && smokeSecs <= 0,");

fs.writeFileSync(fp, s, "utf8");
console.log("main.cjs spike harness added");
