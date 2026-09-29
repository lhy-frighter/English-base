const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/test/v14-migration.cjs";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

R(
  `// ============ B. v13→v14 真实库副本升级 ============
const realDb = path.join(__dirname, "..", "data", "user.sqlite");
const bdir = fs.mkdtempSync(path.join(os.tmpdir(), "v14-upgrade-"));
const bfile = path.join(bdir, "user.sqlite");
{
  const probe = new DatabaseSync(realDb);
  probe.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  probe.close();
}
fs.copyFileSync(realDb, bfile);
const udb = new DatabaseSync(bfile);
check("副本起始 user_version=13", udb.prepare("PRAGMA user_version").get().user_version === 13);`,
  `// ============ B. v13→v14 真实库副本升级 ============
const bdir = fs.mkdtempSync(path.join(os.tmpdir(), "v14-upgrade-"));
const bfile = path.join(bdir, "user.sqlite");
// v13 夹具：用迁移前自动备份（真实 v13 快照）；真实库已迁移后本测试仍可重跑
const fixtureDir = path.join(__dirname, "..", "data", "backups");
const fixtureBaks = fs.existsSync(fixtureDir)
  ? fs.readdirSync(fixtureDir).filter((f) => /^pre-v14/.test(f)).sort()
  : [];
if (fixtureBaks.length === 0) {
  console.log("SKIP Part B：无 pre-v14 v13 夹具");
} else {
fs.copyFileSync(path.join(fixtureDir, fixtureBaks[fixtureBaks.length - 1]), bfile);
const udb = new DatabaseSync(bfile);
check("副本起始 user_version=13", udb.prepare("PRAGMA user_version").get().user_version === 13);`,
  "fixture head"
);

R(
  `check("迁移可重入（cards 不增不减）",
  dump("SELECT id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at FROM cards ORDER BY id").length === beforeCounts.cards);
udb.close();`,
  `check("迁移可重入（cards 不增不减）",
  dump("SELECT id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at FROM cards ORDER BY id").length === beforeCounts.cards);
udb.close();
}`,
  "fixture tail"
);

fs.writeFileSync(p, s);
console.log("Part B fixture patched");
