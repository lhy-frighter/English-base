const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "probe" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(get(res.headers.location));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " " + url)); }
      const chunks = []; res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}
const base = "https://raw.githubusercontent.com/MetaGLM/glm-realtime-sdk/main/frontend/src/";
const files = [
  "utils/chatSDK/lib/userStream.ts",
  "utils/chatSDK/realtimeChat.ts",
  "consts/realtime.ts",
  "utils/chatSDK/lib/vad.ts",
];
(async () => {
  const outDir = path.join(__dirname, "sdk-ref");
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of files) {
    try {
      const buf = await get(base + f);
      const name = f.split("/").pop();
      fs.writeFileSync(path.join(outDir, name), buf);
      console.log("OK", name, buf.length);
    } catch (e) { console.log("FAIL", f, e.message); }
  }
})();
