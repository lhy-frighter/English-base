const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/main.cjs";
let s = fs.readFileSync(p, "utf8");
const eol = s.includes("\r\n") ? "\r\n" : "\n";

function replaceOnce(haystack, find, repl) {
  const i = haystack.indexOf(find);
  if (i < 0) throw new Error("not found: " + find.slice(0, 60));
  if (haystack.indexOf(find, i + 1) >= 0) throw new Error("not unique: " + find.slice(0, 60));
  return haystack.slice(0, i) + repl + haystack.slice(i + find.length);
}

// 1) electron require 加 MessageChannelMain
s = replaceOnce(
  s,
  'const { app, BrowserWindow, ipcMain, Menu, protocol, safeStorage } = require("electron");',
  'const { app, BrowserWindow, ipcMain, Menu, protocol, safeStorage, MessageChannelMain } = require("electron");'
);

// 2) 引入中继模块（放在 cloud-consent require 之后）
s = replaceOnce(
  s,
  'const { parseConsent, normalizeConsent } = require("./cloud-consent.cjs");',
  'const { parseConsent, normalizeConsent } = require("./cloud-consent.cjs");' + eol +
  'const { createRelay } = require("./realtime-relay.cjs");'
);

// 3) realtime-open 处理器：主进程解密 key、校验同意、建 MessageChannel、启动中继
//    插在 ipcMain.handle("cmd", ...) 之前
const handler = [
'    // —— S14-1B Realtime 主进程中继（唯一正式鉴权路径：key 只存主进程，音频走 MessagePort/ArrayBuffer）——',
'    const relayLog = (level, message) => {',
'      try {',
'        fs.appendFileSync(path.join(__dirname, "data", "main.log"),',
'          new Date().toISOString() + " [relay:" + level + "] " + String(message) + "\\n");',
'      } catch { /* ignore */ }',
'    };',
'    ipcMain.on("realtime-open", (event, opts) => {',
'      try {',
'        const consent = parseConsent(core.getSetting("cloud_consent_json", ""));',
'        if (!consent.audio) {',
'          event.senderFrame.postMessage("realtime-port-error", { message: "请先在云端设置中开启「录音原文上云」同意" });',
'          return;',
'        }',
'        const cipher = core.getSetting("cloud_key_cipher", "");',
'        if (!cipher) {',
'          event.senderFrame.postMessage("realtime-port-error", { message: "尚未保存 API Key" });',
'          return;',
'        }',
'        if (!safeStorage.isEncryptionAvailable()) {',
'          event.senderFrame.postMessage("realtime-port-error", { message: "系统加密能力不可用" });',
'          return;',
'        }',
'        const key = safeStorage.decryptString(Buffer.from(cipher, "base64"));',
'        const channel = new MessageChannelMain();',
'        createRelay({ port: channel.port2, apiKey: key, endpoint: opts?.endpoint, log: relayLog });',
'        event.senderFrame.postMessage("realtime-port", null, [channel.port1]);',
'      } catch (e) {',
'        try { event.senderFrame.postMessage("realtime-port-error", { message: e && e.message ? e.message : String(e) }); }',
'        catch { /* noop */ }',
'      }',
'    });',
'',
].join(eol);

s = replaceOnce(
  s,
  '    ipcMain.handle("cmd", (_e, name, args) => {',
  handler + '    ipcMain.handle("cmd", (_e, name, args) => {'
);

fs.writeFileSync(p, s);
console.log("main.cjs patched", fs.statSync(p).size);
