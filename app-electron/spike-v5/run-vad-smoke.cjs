// VAD smoke runner：加载构建产物 dist/spike-v5/vad-smoke.html（无 nodeIntegration，同生产），
// 监听渲染进程 console，出现 VAD_SMOKE_PASS/FAIL/ERROR 后以相应退出码退出。
const { app, BrowserWindow } = require("electron");
const path = require("path");

app.setPath("userData", path.join(__dirname, "..", "data", "vad-smoke-profile"));

let settled = false;
function finish(code, msg) {
  if (settled) return;
  settled = true;
  console.log(msg);
  setTimeout(() => app.exit(code), 300);
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  win.webContents.on("console-message", (_e, _level, message) => {
    if (message.includes("VAD_SMOKE_PASS")) finish(0, "VAD SMOKE: PASS");
    else if (message.includes("VAD_SMOKE_FAIL")) finish(1, "VAD SMOKE: FAIL");
    else if (message.includes("VAD_SMOKE_ERROR")) finish(1, "VAD SMOKE: ERROR " + message);
  });

  win.loadFile(path.join(__dirname, "..", "dist", "spike-v5", "vad-smoke.html"));
  setTimeout(() => finish(1, "VAD SMOKE: TIMEOUT"), 30000);
});
