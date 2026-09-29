const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/main.cjs";
let s = fs.readFileSync(p, "utf8");

const old = `      cloudClearKey: () => {
        core.setSetting("cloud_key_cipher", "");
        return { keySet: false };
      },
`;
if (!s.includes(old)) throw new Error("cloudClearKey anchor missing");
const add = `      cloudClearKey: () => {
        core.setSetting("cloud_key_cipher", "");
        return { keySet: false };
      },
      // V8-4：解密返回 key 明文供云端请求（仅在用户勾选授权、发起云端调用时）
      cloudGetKey: () => {
        const cipher = core.getSetting("cloud_key_cipher", "");
        if (!cipher) return "";
        if (!safeStorage.isEncryptionAvailable()) throw new Error("系统加密能力不可用，无法读取 key");
        return safeStorage.decryptString(Buffer.from(cipher, "base64"));
      },
`;
s = s.replace(old, add);
fs.writeFileSync(p, s);
console.log("cloudGetKey IPC added");
