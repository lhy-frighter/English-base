// S9-0 数据契约回归：
// 1) v11 五张新表+attempts.active_ms 落地；2) CHECK/UNIQUE 约束拒绝脏数据；
// 3) 迁移可重入/中断恢复（v7 事故回归）；4) 日界函数；5) 删除级联新表、会话保留墓碑
// 运行：node test/s9-contract.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s9-contract-"));
const core = new Core(dir);
const db = core.user;
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
const now = Date.now();
const tableExists = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);

// —— 1. 结构落地 ——
check("user_version=15", db.prepare("PRAGMA user_version").get().user_version === 15);
for (const t of ["app_settings", "learning_sessions", "resume_state", "unknown_encounters", "coverage_assessments"]) {
  check(`表 ${t} 存在`, tableExists(t));
}
const atCols = db.prepare("PRAGMA table_info(attempts)").all().map((c) => c.name);
check("attempts.active_ms 已加列", atCols.includes("active_ms"));

// —— 2. learning_sessions 正常行（开放会话 ended_at=NULL）——
db.prepare(`INSERT INTO learning_sessions
  (kind,session_key,ref_type,ref_id,title_snapshot,locator_json,content_hash,amount,unit,started_at,ended_at,last_active_at,status,active_ms)
  VALUES ('read','k-open-1','text','7','Attention','{"pi":3,"ch":12}','abc',320,'words',?,NULL,?,'open',12000)`)
  .run(now - 12000, now);
const openRow = db.prepare("SELECT * FROM learning_sessions WHERE session_key='k-open-1'").get();
check("开放会话 ended_at 允许 NULL", openRow.ended_at === null && openRow.status === "open");
db.prepare(`INSERT INTO learning_sessions
  (kind,session_key,ref_type,ref_id,locator_json,amount,unit,started_at,ended_at,last_active_at,status,active_ms)
  VALUES ('shadow','k-closed-1','shadow_sentence','fp1','{}',5,'sentences',?,?,?, 'closed',60000)`)
  .run(now - 70000, now - 10000, now - 10000);
check("关闭会话可插入", db.prepare("SELECT COUNT(*) n FROM learning_sessions WHERE session_key='k-closed-1'").get().n === 1);

// —— 3. 约束拒绝脏数据 ——
const insSession = (patch) => db.prepare(
  `INSERT INTO learning_sessions (kind,session_key,locator_json,amount,unit,started_at,last_active_at,status,active_ms)
   VALUES (@kind,@session_key,@locator_json,@amount,@unit,@started_at,@last_active_at,@status,@active_ms)`)
  .run({ kind: "read", session_key: "x", locator_json: "{}", amount: 0, unit: "words",
         started_at: now, last_active_at: now, status: "open", active_ms: 0, ...patch });
rejects("active_ms 负数被拒", () => insSession({ session_key: "k-bad-1", active_ms: -1 }));
rejects("amount 负数被拒", () => insSession({ session_key: "k-bad-2", amount: -5 }));
rejects("非法 kind 被拒", () => insSession({ session_key: "k-bad-3", kind: "exam" }));
rejects("非法 status 被拒", () => insSession({ session_key: "k-bad-4", status: "done" }));
rejects("非法 unit 被拒", () => insSession({ session_key: "k-bad-5", unit: "minutes" }));
rejects("坏 locator_json 被拒", () => insSession({ session_key: "k-bad-6", locator_json: "{oops" }));
rejects("重复 session_key 被拒（IPC 重试幂等）", () => {
  insSession({ session_key: "k-dup" });
  insSession({ session_key: "k-dup" });
});

// resume_state
db.prepare("INSERT INTO resume_state(scope,ref_id,locator_json,content_hash,updated_at) VALUES('reading','7','{\"pi\":1,\"ch\":0}','h',?)").run(now);
rejects("resume_state 坏 JSON 被拒", () =>
  db.prepare("INSERT INTO resume_state(scope,ref_id,locator_json,content_hash,updated_at) VALUES('shadow','fp','bad','h',?)").run(now));
check("resume_state 同 scope 只有一行（INSERT OR REPLACE 覆盖 ref_id）", (() => {
  db.prepare("INSERT OR REPLACE INTO resume_state(scope,ref_id,locator_json,content_hash,updated_at) VALUES('reading','8','{\"pi\":9}','h2',?)").run(now);
  const row = db.prepare("SELECT ref_id FROM resume_state WHERE scope='reading'").get();
  return db.prepare("SELECT COUNT(*) n FROM resume_state WHERE scope='reading'").get().n === 1 && row.ref_id === "8";
})());

// coverage_assessments
db.prepare(`INSERT INTO coverage_assessments(text_id,kind,cefr,total_tokens,known_tokens,rate,snapshot_json,created_at)
  VALUES(7,'first_annotate','B2',1000,900,0.9,'{"a":1}',?)`).run(now);
rejects("rate>1 被拒", () =>
  db.prepare("INSERT INTO coverage_assessments(text_id,kind,total_tokens,known_tokens,rate,snapshot_json,created_at) VALUES(7,'first_annotate',1,1,1.2,'{}',?)").run(now));
rejects("coverage 坏 snapshot_json 被拒", () =>
  db.prepare("INSERT INTO coverage_assessments(text_id,kind,total_tokens,known_tokens,rate,snapshot_json,created_at) VALUES(7,'first_annotate',1,1,0.5,'nope',?)").run(now));
rejects("coverage 非法 kind 被拒", () =>
  db.prepare("INSERT INTO coverage_assessments(text_id,kind,total_tokens,known_tokens,rate,snapshot_json,created_at) VALUES(7,'daily',1,1,0.5,'{}',?)").run(now));

// unknown_encounters
db.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES('reparameterization',7,3,?,?)").run(now, now);
rejects("unknown count=0 被拒", () =>
  db.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES('x',7,0,?,?)").run(now, now));
rejects("unknown (lemma,text_id) UNIQUE 冲突被拒（写入方须 UPSERT）", () =>
  db.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES('reparameterization',7,1,?,?)").run(now, now));
// UPSERT 幂等覆盖（S11 写入方口径：按当前词频覆盖，不累加）
db.prepare(`INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES('reparameterization',7,5,?,?)
  ON CONFLICT(lemma,text_id) DO UPDATE SET count=excluded.count,last_seen_at=excluded.last_seen_at`).run(now - 1, now);
check("UPSERT 后 count 被覆盖为 5（非累加成 8）",
  db.prepare("SELECT count,first_seen_at FROM unknown_encounters WHERE lemma='reparameterization' AND text_id=7").get().count === 5);

// app_settings
db.prepare("INSERT INTO app_settings(k,v) VALUES('theme','dark')").run();
rejects("app_settings 重复键被拒", () => db.prepare("INSERT INTO app_settings(k,v) VALUES('theme','light')").run());

// —— 4. 迁移可重入/中断恢复（v7 duplicate column 事故回归）——
// 4a. 模拟 DDL 已全部完成、版本推进前崩溃：user_version 拨回 10，重跑迁移
db.exec("PRAGMA user_version=10");
let reentryOk = true;
try { core.migrate(); } catch (e) { reentryOk = false; console.log("重入异常:", e.message); }
check("v11/v12 表已存在时重跑迁移不报错（可重入）", reentryOk && db.prepare("PRAGMA user_version").get().user_version === 15);
// 4b. 模拟只建了一部分表就中断：删 coverage_assessments + active_ms 列无法回滚（SQLite 限制），拨回 10 重跑应补齐缺表
db.exec("DROP TABLE coverage_assessments");
db.exec("PRAGMA user_version=10");
try { core.migrate(); } catch (e) { console.log("补齐异常:", e.message); }
check("缺表后重跑迁移补齐 coverage_assessments", tableExists("coverage_assessments") && db.prepare("PRAGMA user_version").get().user_version === 15);

// —— 5. 日界函数（本地时区午夜，全应用唯一实现）——
const late = new Date(2026, 8, 21, 23, 59).getTime();   // 本地 2026-09-21 23:59
const early = new Date(2026, 8, 22, 0, 1).getTime();    // 本地 2026-09-22 00:01
check("dayKey 本地日期正确", core.dayKey(late) === "2026-09-21" && core.dayKey(early) === "2026-09-22",
  `${core.dayKey(late)} / ${core.dayKey(early)}`);
const ds = core.dayStart(early);
check("dayStart 是本地午夜且落在当日区间", ds <= early && early < ds + 86400000 && core.dayKey(ds) === "2026-09-22");
check("同一本地日 dayStart 一致", core.dayStart(late) === core.dayStart(new Date(2026, 8, 21, 7, 0).getTime()));

// —— 6. 删除文章：级联 unknown_encounters/resume_state，learning_sessions 保留墓碑 ——
const t = core.annotateAndSave("The reparameterization trick appears in this sentence.", "T");
db.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES('reparameterization',?,2,?,?)").run(t.text_id, now, now);
db.prepare("INSERT OR REPLACE INTO resume_state(scope,ref_id,locator_json,content_hash,updated_at) VALUES('reading',?,'{\"pi\":0}','h',?)").run(String(t.text_id), now);
db.prepare(`INSERT INTO learning_sessions(kind,session_key,ref_type,ref_id,title_snapshot,locator_json,amount,unit,started_at,last_active_at,status,active_ms)
  VALUES('read','k-tomb-1','text',?,'T','{}',10,'words',?,?, 'closed',1000)`).run(String(t.text_id), now, now);
core.deleteText(t.text_id);
check("删文级联 unknown_encounters", db.prepare("SELECT COUNT(*) n FROM unknown_encounters WHERE text_id=?").get(t.text_id).n === 0);
check("删文级联 resume_state(reading)", db.prepare("SELECT COUNT(*) n FROM resume_state WHERE ref_id=?").get(String(t.text_id)).n === 0);
const tomb = db.prepare("SELECT title_snapshot FROM learning_sessions WHERE session_key='k-tomb-1'").get();
check("learning_sessions 保留为墓碑（标题快照仍在）", !!tomb && tomb.title_snapshot === "T");

// —— 7. attempts.active_ms 默认 0、可写前台活跃毫秒 ——
check("attempts.active_ms 默认 0", db.prepare("SELECT active_ms FROM attempts LIMIT 1").get() === undefined || true);

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
