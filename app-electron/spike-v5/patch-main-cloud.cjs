const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/main.cjs";
let s = fs.readFileSync(p, "utf8");

// 1) safeStorage 导入
const reqOld = `const { app, BrowserWindow, ipcMain, Menu, protocol } = require("electron");`;
const reqNew = `const { app, BrowserWindow, ipcMain, Menu, protocol, safeStorage } = require("electron");`;
if (!s.includes(reqOld)) throw new Error("electron require anchor missing");
s = s.replace(reqOld, reqNew);

// 2) 云端 IPC（插在 convClose 之后）
const anchor = `      convClose: (o) => core.convClose(o),
`;
if (!s.includes(anchor)) throw new Error("convClose anchor missing");
const handlers = `      // —— V8-2d 云端显式同意 + safeStorage ——
      cloudGetConsent: () => {
        let consent = { profile: false, historyText: false, audio: false, baseUrl: "", updatedAt: 0 };
        try {
          const raw = core.getSetting("cloud_consent_json", "");
          if (raw) consent = { ...consent, ...JSON.parse(raw) };
        } catch { /* 损坏配置回默认 */ }
        return {
          consent,
          keySet: !!core.getSetting("cloud_key_cipher", ""),
          encryptionAvailable: safeStorage.isEncryptionAvailable(),
        };
      },
      cloudSaveConsent: ({ consent }) => {
        const clean = {
          profile: !!consent?.profile,
          historyText: !!consent?.historyText,
          audio: !!consent?.audio,
          baseUrl: String(consent?.baseUrl || "").slice(0, 300),
          updatedAt: Date.now(),
        };
        core.setSetting("cloud_consent_json", JSON.stringify(clean));
        return clean;
      },
      cloudSetKey: ({ apiKey }) => {
        const key = String(apiKey || "").trim();
        if (!key) throw new Error("API key 为空");
        if (!safeStorage.isEncryptionAvailable()) throw new Error("系统加密能力不可用，无法安全保存 key");
        core.setSetting("cloud_key_cipher", safeStorage.encryptString(key).toString("base64"));
        return { keySet: true };
      },
      cloudClearKey: () => {
        core.setSetting("cloud_key_cipher", "");
        return { keySet: false };
      },
`;
s = s.replace(anchor, anchor + handlers);
fs.writeFileSync(p, s);
console.log("main.cjs cloud IPC added");
