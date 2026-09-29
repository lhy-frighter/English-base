const { app, safeStorage } = require("electron");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
app.setPath("userData", path.join(__dirname, "..", "data", "webllm-profile"));
app.whenReady().then(async () => {
  const db = new DatabaseSync(path.join(__dirname, "..", "data", "user.sqlite"));
  const row = db.prepare("SELECT v FROM app_settings WHERE k='cloud_key_cipher'").get();
  const consentRow = db.prepare("SELECT v FROM app_settings WHERE k='cloud_consent_json'").get();
  db.close();
  const key = safeStorage.decryptString(Buffer.from(row.v, "base64"));
  const consent = JSON.parse(consentRow.v);
  const url = consent.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: consent.model, stream: false, max_tokens: 16,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
    }),
  });
  console.log("text API status:", resp.status);
  const j = await resp.json().catch(() => null);
  console.log("text reply:", j?.choices?.[0]?.message?.content ?? JSON.stringify(j).slice(0, 300));
  app.quit();
});
