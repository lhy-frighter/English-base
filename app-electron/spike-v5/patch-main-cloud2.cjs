const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/main.cjs";
let s = fs.readFileSync(p, "utf8");

// 1) require cloud-consent
const reqAnchor = `const { serveFile, safeJoin } = require("./serve-file.cjs");`;
if (!s.includes(reqAnchor)) throw new Error("serve-file require anchor missing");
s = s.replace(
  reqAnchor,
  reqAnchor + `\nconst { parseConsent, normalizeConsent } = require("./cloud-consent.cjs");`,
);

// 2) cloudGetConsent 用 parseConsent
const getOld = `      cloudGetConsent: () => {
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
      },`;
const getNew = `      cloudGetConsent: () => ({
        consent: parseConsent(core.getSetting("cloud_consent_json", "")),
        keySet: !!core.getSetting("cloud_key_cipher", ""),
        encryptionAvailable: safeStorage.isEncryptionAvailable(),
      }),`;
if (!s.includes(getOld)) throw new Error("cloudGetConsent block missing");
s = s.replace(getOld, getNew);

// 3) cloudSaveConsent 用 normalizeConsent
const saveOld = `      cloudSaveConsent: ({ consent }) => {
        const clean = {
          profile: !!consent?.profile,
          historyText: !!consent?.historyText,
          audio: !!consent?.audio,
          baseUrl: String(consent?.baseUrl || "").slice(0, 300),
          updatedAt: Date.now(),
        };
        core.setSetting("cloud_consent_json", JSON.stringify(clean));
        return clean;
      },`;
const saveNew = `      cloudSaveConsent: ({ consent }) => {
        const clean = normalizeConsent(consent);
        core.setSetting("cloud_consent_json", JSON.stringify(clean));
        return clean;
      },`;
if (!s.includes(saveOld)) throw new Error("cloudSaveConsent block missing");
s = s.replace(saveOld, saveNew);

fs.writeFileSync(p, s);
console.log("main.cjs wired to cloud-consent module");
