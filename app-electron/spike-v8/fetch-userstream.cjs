const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");
function get(url, tries = 5) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      https.get(url, { headers: { "User-Agent": "probe" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); return resolve(get(res.headers.location, tries));
        }
        if (res.statusCode !== 200) { res.resume(); return n > 0 ? attempt(n - 1) : reject(new Error("HTTP " + res.statusCode)); }
        const chunks = []; res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }).on("error", (e) => (n > 0 ? setTimeout(() => attempt(n - 1), 800) : reject(e)));
    };
    attempt(tries);
  });
}
(async () => {
  const buf = await get("https://raw.githubusercontent.com/MetaGLM/glm-realtime-sdk/main/frontend/src/utils/chatSDK/lib/userStream.ts");
  fs.mkdirSync(path.join(__dirname, "sdk-ref"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "sdk-ref", "userStream.ts"), buf);
  console.log("OK", buf.length);
})();
