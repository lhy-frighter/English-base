const fs = require("fs");
const fp = require("path").resolve(__dirname, "..", "test", "s9-contract.cjs");
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(a, b, label) {
  if (!s.includes(a)) throw new Error("anchor missing: " + label);
  s = s.replace(a, b); n++; console.log("patched", label);
}
rep(
`check("resume_state 同 scope UPSERT 语义（PRIMARY KEY 替换）", (() => {
  db.prepare("INSERT OR REPLACE INTO resume_state(scope,ref_id,locator_json,content_hash,updated_at) VALUES('reading','8','{\\"pi\\":9}','h2',?)").run(now);
  return db.prepare("SELECT COUNT(*) n FROM resume_state WHERE scope='reading'").get().n === 2;
})());`,
`check("resume_state 同 scope 只有一行（INSERT OR REPLACE 覆盖 ref_id）", (() => {
  db.prepare("INSERT OR REPLACE INTO resume_state(scope,ref_id,locator_json,content_hash,updated_at) VALUES('reading','8','{\\"pi\\":9}','h2',?)").run(now);
  const row = db.prepare("SELECT ref_id FROM resume_state WHERE scope='reading'").get();
  return db.prepare("SELECT COUNT(*) n FROM resume_state WHERE scope='reading'").get().n === 1 && row.ref_id === "8";
})());`,
"UPSERT 期望");
rep(
`db.prepare("INSERT INTO resume_state(scope,ref_id,locator_json,content_hash,updated_at) VALUES('reading',?,'{\\"pi\\":0}','h',?)").run(String(t.text_id), now);`,
`db.prepare("INSERT OR REPLACE INTO resume_state(scope,ref_id,locator_json,content_hash,updated_at) VALUES('reading',?,'{\\"pi\\":0}','h',?)").run(String(t.text_id), now);`,
"级联段 resume 插入改 REPLACE");
fs.writeFileSync(fp, s, "utf8");
console.log("done", n);
