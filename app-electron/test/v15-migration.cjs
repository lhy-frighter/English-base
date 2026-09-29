// V10 migration v15 契约：
// A) 全新库到 v15：evidence CHECK 十值、shadow_sentences origin_kind/origin_ref、debrief_drafts；
// B) v14→v15 升级：evidence 全量逐行拷贝、计数无漂移、integrity/FK、可重入；
// C) debrief_drafts 业务约束：唯一(origin_kind,origin_ref)、candidates json、status 白名单。
// 运行：node test/v15-migration.cjs
const { Core, MIGRATIONS } = require("../core.cjs");
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}
function rejects(name, fn) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  check(name, threw);
}
const tableExists = (db, t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const colNames = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const now = Date.now();
let counter = 0;

// ============ A. 全新库到 v15 ============
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v15-fresh-"));
const core = new Core(dir);
const db = core.user;
check("user_version=15", db.prepare("PRAGMA user_version").get().user_version === 15);
check("debrief_drafts 存在", tableExists(db, "debrief_drafts"));
const shCols = colNames(db, "shadow_sentences");
check("shadow_sentences 有 origin_kind", shCols.includes("origin_kind"));
check("shadow_sentences 有 origin_ref", shCols.includes("origin_ref"));

// 造一个 chunk 资产用于 evidence
function insAsset(kind, canonical) {
  const idem = "op-" + counter++;
  return db.prepare(`INSERT INTO learning_assets
    (asset_kind,canonical,payload_json,identity_key,created_at,idempotency_key)
    VALUES(?,?,'{}',?,?,?)`)
    .run(kind, canonical, "id-" + counter, now, idem).lastInsertRowid;
}
const aId = insAsset("chunk", "v15 test chunk");

// evidence 十值全部可写
const TEN = ['correct','partial','wrong','practice_observation','improved','recurred',
  'recognized','used_spontaneously','used_prompted','used_after_correction'];
for (const r of TEN) {
  check(`evidence result='${r}' 可写`,
    db.prepare(`INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
      VALUES(?,'d',?,'conversation',?,?)`).run(aId, r, now, "ev-" + r).changes === 1);
}
rejects("evidence 第 11 个非法值被拒", () => {
  db.prepare(`INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
    VALUES(?,'d','nope','conversation',?,'ev-bad')`).run(aId, now);
});

// shadow_sentences origin_kind 写入
check("shadow 句可带 origin_kind/origin_ref",
  db.prepare(`INSERT INTO shadow_sentences
    (sentence_hash,sentence,first_practiced_at,last_practiced_at,due_at,origin_kind,origin_ref)
    VALUES('h1','shadow sentence',?,0,?,'conversation','turn:9')`).run(now, now).changes === 1);

// ============ B. v14→v15 升级（构造 v14 库） ============
const bdir = fs.mkdtempSync(path.join(os.tmpdir(), "v15-upgrade-"));
const bfile = path.join(bdir, "user.sqlite");
const udb = new DatabaseSync(bfile);
for (let i = 0; i < 14; i++) {
  const step = MIGRATIONS[i];
  if (typeof step === "function") step(udb);
  else udb.exec(step);
  udb.exec(`PRAGMA user_version=${i + 1}`);
}
check("构造库 user_version=14", udb.prepare("PRAGMA user_version").get().user_version === 14);
// 造资产 + 旧口径 evidence（含旧 6 值）
const bAsset = udb.prepare(`INSERT INTO learning_assets
  (asset_kind,canonical,payload_json,identity_key,created_at,idempotency_key)
  VALUES('chunk','upgrade chunk','{}','chk:up',?,'b-op1')`).run(now).lastInsertRowid;
const oldResults = ['correct','partial','wrong','improved','recurred','used_spontaneously'];
oldResults.forEach((r, i) => {
  udb.prepare(`INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
    VALUES(?,'d',?,'conversation',?,?)`).run(bAsset, r, now, "old-" + i);
});
const beforeEv = udb.prepare("SELECT * FROM asset_evidence ORDER BY id").all().map((r) => JSON.stringify(r));
udb.exec("PRAGMA foreign_keys=OFF");
udb.exec("BEGIN");
try {
  MIGRATIONS[14](udb); // migrateV15
  udb.exec("PRAGMA user_version=15");
  udb.exec("COMMIT");
  udb.exec("PRAGMA foreign_keys=ON");
} catch (e) {
  udb.exec("ROLLBACK");
  try { udb.exec("PRAGMA foreign_keys=ON"); } catch { /* ignore */ }
  throw e;
}
const afterEv = udb.prepare("SELECT * FROM asset_evidence ORDER BY id").all().map((r) => JSON.stringify(r));
check("evidence 逐行拷贝无漂移", JSON.stringify(beforeEv) === JSON.stringify(afterEv),
  `(${beforeEv.length} rows)`);
check("升级后 user_version=15", udb.prepare("PRAGMA user_version").get().user_version === 15);
check("integrity_check=ok", udb.prepare("PRAGMA integrity_check").get().integrity_check === "ok");
check("foreign_key_check=0", udb.prepare("PRAGMA foreign_key_check").all().length === 0);
// 可重入
MIGRATIONS[14](udb);
check("迁移可重入（evidence 不增不减）",
  udb.prepare("SELECT COUNT(*) n FROM asset_evidence").get().n === beforeEv.length);
udb.close();

// ============ C. debrief_drafts 约束 ============
check("debrief 草稿可写",
  db.prepare(`INSERT INTO debrief_drafts(draft_key,origin_kind,origin_ref,candidates_json,created_at,updated_at)
    VALUES('k1','reading','7','[]',?,?)`).run(now, now).changes === 1);
rejects("同 (origin_kind,origin_ref) 第二稿被拒", () => {
  db.prepare(`INSERT INTO debrief_drafts(draft_key,origin_kind,origin_ref,created_at,updated_at)
    VALUES('k2','reading','7',?,?)`).run(now, now);
});
rejects("origin_kind 非法被拒", () => {
  db.prepare(`INSERT INTO debrief_drafts(draft_key,origin_kind,origin_ref,created_at,updated_at)
    VALUES('k3','nope','8',?,?)`).run(now, now);
});
rejects("status 非法被拒", () => {
  db.prepare(`INSERT INTO debrief_drafts(draft_key,origin_kind,origin_ref,status,created_at,updated_at)
    VALUES('k4','exam','9','nope',?,?)`).run(now, now);
});
rejects("candidates_json 非法被拒", () => {
  db.prepare(`INSERT INTO debrief_drafts(draft_key,origin_kind,origin_ref,candidates_json,created_at,updated_at)
    VALUES('k5','exam','10','{bad',?,?)`).run(now, now);
});
check("候选 JSON 数组可写",
  db.prepare(`INSERT INTO debrief_drafts(draft_key,origin_kind,origin_ref,candidates_json,created_at,updated_at)
    VALUES('k6','conversation','sess:1','[{"kind":"word"}]',?,?)`).run(now, now).changes === 1);

console.log(`\nv15 contract: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
