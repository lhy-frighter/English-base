const { app, safeStorage } = require("electron");
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

app.whenReady().then(() => {
  console.log("enc available:", safeStorage.isEncryptionAvailable());
  // roundtrip self-test
  const secret = "hello-key-123";
  const enc = safeStorage.encryptString(secret);
  console.log("roundtrip:", safeStorage.decryptString(enc) === secret);
  console.log("enc prefix bytes:", [...enc.slice(0, 4)].map((b) => b.toString(16)).join(" "));

  const db = new DatabaseSync(path.join(__dirname, "..", "data", "user.sqlite"));
  const row = db.prepare("SELECT v FROM app_settings WHERE k='cloud_key_cipher'").get();
  db.close();
  const buf = Buffer.from(row.v, "base64");
  console.log("stored prefix bytes:", [...buf.slice(0, 4)].map((b) => b.toString(16)).join(" "), "len:", buf.length);
  try {
    const dec = safeStorage.decryptString(buf);
    console.log("stored decrypt OK, len:", dec.length);
  } catch (e) {
    console.log("stored decrypt FAIL:", e.message);
  }
  app.quit();
});
