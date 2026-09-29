const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/spike-v8/probe-response-format.cjs";
let s = fs.readFileSync(p, "utf8");
s = s.split("SELECT value FROM app_settings WHERE key='cloud_key_cipher'").join("SELECT v FROM app_settings WHERE k='cloud_key_cipher'");
s = s.split("SELECT value FROM app_settings WHERE key='cloud_consent_json'").join("SELECT v FROM app_settings WHERE k='cloud_consent_json'");
s = s.split("cipherRow.value").join("cipherRow.v");
s = s.split("consentRow.value").join("consentRow.v");
fs.writeFileSync(p, s);
console.log("fixed");
