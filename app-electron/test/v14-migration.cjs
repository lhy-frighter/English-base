// V9 migration v14 契约：
// A) 全新库到 v14，四表 + 全量 CHECK/UNIQUE/部分唯一索引/XOR 约束；
// B) v13→v14 真实库副本升级：cards 全字段逐行一致、review_log 不变、integrity/FK、可重入；
// C) 业务测试：同资产两位置两次 encounter；队列 ≥2 张 asset 卡均可取出（不被 note_id=NULL 互埋）。
// 运行：node test/v14-migration.cjs
const { MIGRATIONS_VERSION_HINT: EXPECTED_VER } = require("../core.cjs");
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
const now = Date.now();
let counter = 0;

// ============ A. 全新库到 v14 ============
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v14-fresh-"));
const core = new Core(dir);
const db = core.user;
check("user_version 为最新（migrate 跑到最新）", db.prepare("PRAGMA user_version").get().user_version === EXPECTED_VER);
for (const t of ["learning_assets", "asset_encounters", "asset_relations", "asset_evidence"]) {
  check(`表 ${t} 存在`, tableExists(db, t));
}

function insAsset(kind, canonical, o = {}) {
  const idem = "op-" + counter++;
  return db.prepare(`INSERT INTO learning_assets
    (asset_kind,canonical,gloss,payload_json,lexeme_id,identity_key,status,created_at,idempotency_key)
    VALUES(?,?,?,?,?,?, 'active',?,?)`)
    .run(kind, canonical, o.gloss ?? "", o.payload ?? "{}", o.lexeme_id ?? null,
      o.identity ?? ("id-" + counter), now, idem).lastInsertRowid;
}

// learning_assets 约束
rejects("asset_kind 非法值被拒", () => insAsset("nope", "x"));
rejects("chunk 携带 lexeme_id 被拒", () => insAsset("chunk", "x", { lexeme_id: 1 }));
rejects("payload_json 非法被拒", () => insAsset("chunk", "x", { payload: "{bad" }));
const chkId = insAsset("chunk", "it's up to you", { identity: "chk:its-up-to-you" });
rejects("identity_key 重复被拒（跨入口不重建）",
  () => insAsset("chunk", "IT'S UP TO YOU", { identity: "chk:its-up-to-you" }));
rejects("idempotency_key 重复被拒", () => {
  db.prepare(`INSERT INTO learning_assets
    (asset_kind,canonical,identity_key,created_at,idempotency_key) VALUES('chunk','a','id-x',?,'dup')`).run(now);
  db.prepare(`INSERT INTO learning_assets
    (asset_kind,canonical,identity_key,created_at,idempotency_key) VALUES('chunk','b','id-y',?,'dup')`).run(now);
});
// word 必须有 lexeme；一个 lexeme 至多一个 word asset
rejects("word 缺 lexeme_id 被拒", () => insAsset("word", "zzz"));
const lexId = db.prepare("INSERT INTO lexemes(lemma,pos,sense,created_at) VALUES('v14word','n','释义',?)")
  .run(now).lastInsertRowid;
insAsset("word", "v14word", { lexeme_id: lexId, identity: `lex:${lexId}` });
rejects("同 lexeme 第二个 word asset 被拒（部分唯一索引）",
  () => insAsset("word", "v14word", { lexeme_id: lexId, identity: `lex2:${lexId}` }));

// encounters：同篇两位置两次；重复位置被拒；CHECK
function insEnc(assetId, locHash, o = {}) {
  return db.prepare(`INSERT INTO asset_encounters
    (asset_id,origin_kind,origin_ref,locator_json,locator_hash,source_status,encountered_at)
    VALUES(?, 'reading',?,  ?,?,  'active',?)`)
    .run(assetId, o.ref ?? "42", o.locator ?? '{"pi":1}', locHash, now).changes;
}
check("同篇位置1 encounter", insEnc(chkId, "h1") === 1);
check("同篇位置2 encounter（不同 locator_hash）", insEnc(chkId, "h2") === 1);
rejects("同位置重复 encounter 被拒", () => insEnc(chkId, "h1"));
rejects("origin_kind 非法被拒", () => {
  db.prepare(`INSERT INTO asset_encounters(asset_id,origin_kind,locator_hash,encountered_at)
    VALUES(?,'bad','h3',?)`).run(chkId, now);
});
rejects("locator_json 非法被拒", () => {
  db.prepare(`INSERT INTO asset_encounters(asset_id,origin_kind,locator_json,locator_hash,encountered_at)
    VALUES(?,'reading','{oops','h4',?)`).run(chkId, now);
});
rejects("source_status 非法被拒", () => {
  db.prepare(`INSERT INTO asset_encounters(asset_id,origin_kind,locator_hash,source_status,encountered_at)
    VALUES(?,'reading','h5','nope',?)`).run(chkId, now);
});
check("该 chunk 共 2 次相遇",
  db.prepare("SELECT COUNT(*) n FROM asset_encounters WHERE asset_id=?").get(chkId).n === 2);

// relations
const otherId = insAsset("chunk", "you know what", { identity: "chk:you-know-what" });
rejects("relation 自关联被拒", () => {
  db.prepare("INSERT INTO asset_relations(from_asset,to_asset,rel) VALUES(?,?, 'contains')")
    .run(chkId, chkId);
});
rejects("rel 白名单外被拒", () => {
  db.prepare("INSERT INTO asset_relations(from_asset,to_asset,rel) VALUES(?,?, 'nope')")
    .run(chkId, otherId);
});
check("合法 relation 写入",
  db.prepare("INSERT INTO asset_relations(from_asset,to_asset,rel) VALUES(?,?,'contains')")
    .run(otherId, chkId).changes === 1);
rejects("detail_json 非法被拒", () => {
  db.prepare("INSERT INTO asset_relations(from_asset,to_asset,rel,detail_json) VALUES(?,?,'variant_of','bad)')")
    .run(chkId, otherId);
});

// evidence
rejects("evidence result 非法被拒", () => {
  db.prepare(`INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
    VALUES(?,'d','bad','reading',?,'e1')`).run(chkId, now);
});
rejects("evidence source_kind 非法被拒", () => {
  db.prepare(`INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
    VALUES(?,'d','correct','bad',?,'e2')`).run(chkId, now);
});
rejects("evidence idempotency 重复被拒", () => {
  const sql = "INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key) VALUES(?,'d','correct','reading',?,'e3')";
  db.prepare(sql).run(chkId, now);
  db.prepare(sql).run(chkId, now);
});
check("合法 evidence 写入",
  db.prepare(`INSERT INTO asset_evidence(asset_id,dimension,result,source_kind,occurred_at,idempotency_key)
    VALUES(?,'chunk_used','used_spontaneously','conversation',?,'e4')`).run(chkId, now).changes === 1);

// cards XOR
const insCard = (noteId, assetId) => db.prepare(
  "INSERT INTO cards(note_id,asset_id,card_type,due,created_at) VALUES(?,?, 'x',0,?)")
  .run(noteId, assetId, now).changes;
const noteId = db.prepare("INSERT INTO notes(lexeme_id,context_sentence,created_at,source) VALUES(?,?,?,'reading')")
  .run(lexId, "a real note sentence", now).lastInsertRowid;
rejects("cards 双 NULL 被拒", () => insCard(null, null));
rejects("cards 双非空被拒", () => insCard(noteId, chkId));
check("cards note 归属可写", insCard(noteId, null) === 1);
check("cards asset 归属可写", insCard(null, chkId) === 1);

// ============ B. v13→v14 真实库副本升级 ============
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
check("副本起始 user_version=13", udb.prepare("PRAGMA user_version").get().user_version === 13);
const dump = (sql) => udb.prepare(sql).all().map((r) => JSON.stringify(r));
const beforeCards = dump("SELECT * FROM cards ORDER BY id");
const beforeReview = dump("SELECT * FROM review_log ORDER BY id");
const beforeCounts = {
  cards: beforeCards.length,
  review: beforeReview.length,
  lexemes: udb.prepare("SELECT COUNT(*) n FROM lexemes").get().n,
  notes: udb.prepare("SELECT COUNT(*) n FROM notes").get().n,
};
udb.exec("PRAGMA foreign_keys=OFF");
udb.exec("BEGIN");
try {
  MIGRATIONS[13](udb); // migrateV14
  udb.exec("PRAGMA user_version=14");
  udb.exec("COMMIT");
  udb.exec("PRAGMA foreign_keys=ON");
} catch (e) {
  udb.exec("ROLLBACK");
  try { udb.exec("PRAGMA foreign_keys=ON"); } catch { /* ignore */ }
  throw e;
}
const afterCards = dump("SELECT id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at FROM cards ORDER BY id");
const afterReview = dump("SELECT * FROM review_log ORDER BY id");
check("cards 全字段逐行一致", JSON.stringify(beforeCards) === JSON.stringify(afterCards),
  `(${beforeCards.length} rows)`);
check("review_log 逐行一致", JSON.stringify(beforeReview) === JSON.stringify(afterReview));
check("lexemes/notes 行数不变",
  udb.prepare("SELECT COUNT(*) n FROM lexemes").get().n === beforeCounts.lexemes &&
  udb.prepare("SELECT COUNT(*) n FROM notes").get().n === beforeCounts.notes);
check("integrity_check=ok", udb.prepare("PRAGMA integrity_check").get().integrity_check === "ok");
check("foreign_key_check=0", udb.prepare("PRAGMA foreign_key_check").all().length === 0);
check("升级后 user_version=14", udb.prepare("PRAGMA user_version").get().user_version === 14);
// 可重入：再跑一次无变化
MIGRATIONS[13](udb);
check("迁移可重入（cards 不增不减）",
  dump("SELECT id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at FROM cards ORDER BY id").length === beforeCounts.cards);
udb.close();
}

// ============ C. 业务测试：≥2 asset 卡均可从队列取出 ============
const qdir = fs.mkdtempSync(path.join(os.tmpdir(), "v14-queue-"));
const qcore = new Core(qdir);
const qdb = qcore.user;
const a1 = qdb.prepare(`INSERT INTO learning_assets
  (asset_kind,canonical,gloss,payload_json,identity_key,created_at,idempotency_key)
  VALUES('chunk','chunk one','意思1','{}','chk:one',?,'q-op1')`).run(now).lastInsertRowid;
const a2 = qdb.prepare(`INSERT INTO learning_assets
  (asset_kind,canonical,gloss,payload_json,identity_key,created_at,idempotency_key)
  VALUES('chunk','chunk two','意思2','{}','chk:two',?,'q-op2')`).run(now).lastInsertRowid;
qdb.prepare("INSERT INTO cards(asset_id,card_type,due,state,created_at) VALUES(?,'chunk_recall',0,0,?)")
  .run(a1, now);
qdb.prepare("INSERT INTO cards(asset_id,card_type,due,state,created_at) VALUES(?,'chunk_recall',0,0,?)")
  .run(a2, now);
const due = qcore.getDue(10);
const dueAssetIds = due.filter((d) => d.asset_id != null).map((d) => d.asset_id);
check("两张 asset 卡均取出（未被 null note_id 互埋）",
  dueAssetIds.includes(a1) && dueAssetIds.includes(a2), JSON.stringify(dueAssetIds));

console.log(`\nv14 contract: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
