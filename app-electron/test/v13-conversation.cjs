// V8-0 migration v13 契约回归：
// 1) conversation_sessions/turns 落地、状态机与 CHECK/UNIQUE；2) learning_sessions.kind 扩展 conversation（表重建数据不丢）；
// 3) v12→v13 真实升级路径；4) 迁移可重入。
// 运行：node test/v13-conversation.cjs
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

// —— 1. 全新库直接到 v13 ——
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v13-fresh-"));
const core = new Core(dir);
const db = core.user;
check("user_version=15", db.prepare("PRAGMA user_version").get().user_version === 15);
for (const t of ["conversation_sessions", "conversation_turns"]) {
  check(`表 ${t} 存在`, tableExists(db, t));
}

// learning_sessions 三 kind
function insertLS(kind, key) {
  db.prepare(`INSERT INTO learning_sessions
    (kind,session_key,ref_type,ref_id,title_snapshot,locator_json,content_hash,amount,unit,started_at,ended_at,last_active_at,status,active_ms)
    VALUES (?,?,  '','','t','{}','',0,'',?,NULL,?,'open',0)`)
    .run(kind, key, now, now);
}
insertLS("read", "ls-read"); insertLS("shadow", "ls-shadow"); insertLS("conversation", "ls-conv");
check("learning_sessions 支持 conversation kind",
  db.prepare("SELECT COUNT(*) n FROM learning_sessions WHERE kind='conversation'").get().n === 1);
rejects("learning_sessions 拒绝非法 kind", () => insertLS("bogus", "ls-bogus"));
rejects("learning_sessions conversation 摘要 unit=turns 合法/非法 unit 拒绝", () => {
  db.prepare(`INSERT INTO learning_sessions
    (kind,session_key,locator_json,unit,started_at,last_active_at)
    VALUES ('conversation','ls-badunit','{}','bogus',?,?)`).run(now, now);
});
db.prepare(`INSERT INTO learning_sessions
  (kind,session_key,locator_json,unit,started_at,last_active_at)
  VALUES ('conversation','ls-turns','{}','turns',?,?)`).run(now, now);
check("conversation 摘要 unit=turns 可插入",
  db.prepare("SELECT 1 FROM learning_sessions WHERE session_key='ls-turns' AND unit='turns'").get() !== undefined);

// —— 2. conversation_sessions / turns 契约 ——
db.prepare(`INSERT INTO conversation_sessions
  (session_key,title,topic_json,started_at,ended_at,last_active_at,status,active_ms,
   brain_engine,brain_model_revision,augmented,cefr_at_start,turns_count)
  VALUES ('conv-1','点餐练习','{"goal":"ordering food","cefr":"B1","suggestedTurns":10}',
   ?,NULL,?,'open',0,'local','Qwen2.5-3B-q4',0,'B1',0)`).run(now, now);
const csId = db.prepare("SELECT id FROM conversation_sessions WHERE session_key='conv-1'").get().id;

rejects("topic_json 非法 JSON 拒绝", () => {
  db.prepare(`INSERT INTO conversation_sessions
    (session_key,topic_json,started_at,last_active_at,status)
    VALUES ('conv-bad','{oops',?,?,'open')`).run(now, now);
});

function insertTurn(o) {
  db.prepare(`INSERT INTO conversation_turns
    (turn_key,session_id,seq,role,status,text,committed_text,played_char_end,
     provider,model_revision,local_feedback_json,cloud_feedback_json,augment_status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(o.key, csId, o.seq, o.role, o.status, o.text ?? "", o.committed ?? "",
      o.played ?? null, o.provider ?? "", o.model ?? "", "[]", "[]", o.augment ?? "pending", now);
}
// 合法状态机各状态
["user_draft", "user_confirmed", "generating", "speaking", "completed", "interrupted", "failed"]
  .forEach((st, i) => check(`状态 ${st} 可插入`, (() => {
    try {
      insertTurn({ key: "tk-" + st, seq: i, role: i % 2 ? "assistant" : "user", status: st });
      return true;
    } catch { return false; }
  })()));
rejects("非法 turn status 拒绝", () => insertTurn({ key: "tk-bad", seq: 99, role: "user", status: "nope" }));
rejects("turn_key 重复拒绝", () => insertTurn({ key: "tk-completed", seq: 98, role: "user", status: "completed" }));
rejects("(session,seq) 重复拒绝", () => insertTurn({ key: "tk-dupseq", seq: 0, role: "user", status: "completed" }));
rejects("非法 role 拒绝", () => insertTurn({ key: "tk-role", seq: 97, role: "system", status: "completed" }));
rejects("local_feedback_json 非法拒绝", () => {
  db.prepare(`INSERT INTO conversation_turns(turn_key,session_id,seq,role,status,local_feedback_json,created_at)
    VALUES ('tk-fb',?,96,'user','completed','x',?)`).run(csId, now);
});
rejects("augment_status 非法拒绝", () => insertTurn({ key: "tk-aug", seq: 95, role: "user", status: "completed", augment: "later" }));
// 播放游标：句中打断，committed 为已播前缀
insertTurn({ key: "tk-cursor", seq: 94, role: "assistant", status: "interrupted",
  text: "I would recommend the pasta, it is our specialty.",
  committed: "I would recommend the pasta,", played: 29 });
const cur = db.prepare("SELECT committed_text, played_char_end FROM conversation_turns WHERE turn_key='tk-cursor'").get();
check("播放游标与已播前缀保存", cur.committed_text === "I would recommend the pasta," && cur.played_char_end === 29);
// 级联删除
db.prepare("DELETE FROM conversation_sessions WHERE id=?").run(csId);
check("删除会话级联清理 turns",
  db.prepare("SELECT COUNT(*) n FROM conversation_turns WHERE session_id=?").get(csId).n === 0);

// —— 3. v12→v13 真实升级（旧 learning_sessions 数据不丢）——
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "v13-up-"));
const dbFile = path.join(dir2, "user.sqlite");
const old = new DatabaseSync(dbFile);
for (let i = 0; i < 12; i++) {
  const step = MIGRATIONS[i];
  if (typeof step === "function") step(old);
  else old.exec(step);
  old.exec(`PRAGMA user_version=${i + 1}`);
}
old.prepare(`INSERT INTO learning_sessions
  (kind,session_key,locator_json,unit,started_at,last_active_at)
  VALUES ('read','old-1','{}','words',?,?)`).run(now, now);
old.close();
const up = new Core(dir2);
check("升级后 user_version=15", up.user.prepare("PRAGMA user_version").get().user_version === 15);
check("旧 learning_sessions 行在表重建后保留",
  up.user.prepare("SELECT 1 FROM learning_sessions WHERE session_key='old-1' AND kind='read'").get() !== undefined);
check("升级后 conversation 表存在", tableExists(up.user, "conversation_turns"));
check("升级后索引重建",
  up.user.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_sessions_kind_start'").get() !== undefined);

// —— 4. 可重入：版本拨回 12 重跑 ——
up.user.close();
const reopen = new DatabaseSync(dbFile);
reopen.exec("PRAGMA user_version=12");
reopen.close();
let reentryErr = null;
let core3;
try { core3 = new Core(dir2); } catch (e) { reentryErr = e; }
check("重入迁移不报错且版本=15",
  !reentryErr && core3.user.prepare("PRAGMA user_version").get().user_version === 15, String(reentryErr));
check("重入后旧数据仍在",
  core3.user.prepare("SELECT 1 FROM learning_sessions WHERE session_key='old-1'").get() !== undefined);
core3.user.close();

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(dir2, { recursive: true, force: true });

console.log(`\n# fail ${fail}`);
process.exit(fail ? 1 : 0);
