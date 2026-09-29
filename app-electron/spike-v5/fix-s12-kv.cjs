const fs = require("fs");
const fp = "core.cjs";
let s = fs.readFileSync(fp, "utf8");
let n = 0;
const pairs = [
  [`SELECT value FROM app_settings WHERE key='parallel_used_forms'`,
   `SELECT v FROM app_settings WHERE k='parallel_used_forms'`, "select"],
  [`"INSERT INTO app_settings(key,value) VALUES('parallel_used_forms',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"`,
   `"INSERT INTO app_settings(k,v) VALUES('parallel_used_forms',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v"`, "upsert"],
];
for (const [a, b, label] of pairs) {
  if (s.includes(a)) { s = s.replace(a, b); n++; console.log("fixed:", label); }
}
if (!n) console.log("already");
fs.writeFileSync(fp, s, "utf8");
