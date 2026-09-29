const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE t(x TEXT CHECK(json_valid(x)))");
try {
  db.prepare("INSERT INTO t VALUES (?)").run("{bad");
  console.log("BAD JSON ACCEPTED - json_valid missing");
} catch (e) {
  console.log("bad json rejected OK:", e.codeName || e.message.slice(0, 60));
}
db.prepare("INSERT INTO t VALUES (?)").run("{}");
console.log("valid ok, sqlite", db.prepare("select sqlite_version() v").get().v);
db.exec("CREATE TABLE s(active_ms INTEGER CHECK(active_ms>=0))");
try { db.prepare("INSERT INTO s VALUES (-1)").run(); console.log("NEG ACCEPTED"); }
catch { console.log("negative rejected OK"); }
