const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");

const anchor = `  getBuiltin(id) {
    return this.builtins.find((b) => b.id === id) || null;
  }
`;
if (!s.includes(anchor)) throw new Error("core anchor missing");
const add = `
  // 通用设置读写（app_settings）
  getSetting(k, dflt = "") {
    const row = this.user.prepare("SELECT v FROM app_settings WHERE k=?").get(k);
    return row ? row.v : dflt;
  }

  setSetting(k, v) {
    this.user
      .prepare("INSERT INTO app_settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v")
      .run(k, String(v));
  }
`;
s = s.replace(anchor, anchor + add);
fs.writeFileSync(p, s);
console.log("core.cjs getSetting/setSetting added");
