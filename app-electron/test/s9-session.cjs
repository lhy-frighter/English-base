// S9-1 会话记录与活跃计时回归：
// begin 幂等 / heartbeat 单调钳制 / close 幂等 / 启动回收 /
// 标注填充 unknown_encounters（词频覆盖不累加、proper/miss 不进、成卡后保留）/
// coverage_assessments 首标不可变
// 运行：node test/s9-session.cjs
const { Core } = require("../core.cjs");
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s9-session-"));
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

// —— 1. begin / 幂等 ——
const s1 = core.beginSession({ kind: "read", refType: "text", refId: "7", titleSnapshot: "Attention", unit: "words", amount: 320 });
check("begin 返回 open 会话与 key", s1.status === "open" && s1.endedAt === null && s1.kind === "read" && !!s1.sessionKey);
const s1b = core.beginSession({ kind: "read", sessionKey: s1.sessionKey, refType: "text", refId: "7", unit: "words" });
check("同 key 重试幂等（同一行）", s1b.id === s1.id);
rejects("非法 kind 被拒", () => core.beginSession({ kind: "exam", refType: "t", refId: "1" }));
rejects("坏 locator 被拒", () => core.beginSession({ kind: "read", refType: "t", refId: "1", locator: "{bad" }));

// —— 2. heartbeat 单调钳制 ——
core.heartbeatSession(s1.sessionKey, { activeMs: 20000, amount: 400 });
let row = db.prepare("SELECT * FROM learning_sessions WHERE id=?").get(s1.id);
check("heartbeat 更新 active_ms/amount/last_active", row.active_ms === 20000 && row.amount === 400 && row.last_active_at >= row.started_at);
core.heartbeatSession(s1.sessionKey, { activeMs: 5000, amount: 100 }); // 乱序/重发的小值
row = db.prepare("SELECT * FROM learning_sessions WHERE id=?").get(s1.id);
check("active_ms/amount 单调不回退", row.active_ms === 20000 && row.amount === 400);
rejects("heartbeat 未知 key 报错", () => core.heartbeatSession("nope", { activeMs: 1 }));

// —— 3. close 幂等；close 后 heartbeat 不再改动 ——
const c1 = core.closeSession(s1.sessionKey, { activeMs: 30000, amount: 410 });
check("close 置 closed 并补 ended_at", c1.status === "closed" && c1.endedAt != null && c1.activeMs === 30000 && c1.amount === 410);
core.heartbeatSession(s1.sessionKey, { activeMs: 999999, amount: 999 });
row = db.prepare("SELECT * FROM learning_sessions WHERE id=?").get(s1.id);
check("close 后心跳不再改动", row.status === "closed" && row.active_ms === 30000);
check("重复 close 幂等", core.closeSession(s1.sessionKey, { activeMs: 1 }) !== null);
check("close 未知 key 返回 null", core.closeSession("nope") === null);

// —— 4. 启动回收（直接注入 now）——
const old = core.beginSession({ kind: "read", refType: "text", refId: "8", unit: "words" });
const fresh = core.beginSession({ kind: "shadow", refType: "shadow_page", refId: "shadow", unit: "sentences" });
const closed = core.beginSession({ kind: "read", refType: "text", refId: "9", unit: "words" });
core.closeSession(closed.sessionKey, { activeMs: 1, amount: 1 });
const now = Date.now();
db.prepare("UPDATE learning_sessions SET last_active_at=? WHERE session_key=?").run(now - 11 * 60 * 1000, old.sessionKey);
const reaped = core.reapAbandonedSessions(now);
const oldRow = db.prepare("SELECT * FROM learning_sessions WHERE id=?").get(old.id);
const freshRow = db.prepare("SELECT * FROM learning_sessions WHERE id=?").get(fresh.id);
check("超时 open 会话被回收（reaped=1）", reaped === 1, String(reaped));
check("旧会话 abandoned 且 ended_at=last_active+20s",
  oldRow.status === "abandoned" && oldRow.ended_at === oldRow.last_active_at + 20000);
check("新鲜 open 与已 closed 不动", freshRow.status === "open" && db.prepare("SELECT status FROM learning_sessions WHERE id=?").get(closed.id).status === "closed");
check("再次回收幂等（0）", core.reapAbandonedSessions(now) === 0);

// —— 5. 构造函数自动回收 ——
const stale = core.beginSession({ kind: "read", refType: "text", refId: "10", unit: "words" });
db.prepare("UPDATE learning_sessions SET last_active_at=? WHERE session_key=?").run(Date.now() - 12 * 60 * 1000, stale.sessionKey);
core.user.close();
const reopened = new Core(dir);
check("新 Core 构造时回收遗留 open 会话",
  reopened.user.prepare("SELECT status FROM learning_sessions WHERE id=?").get(stale.id).status === "abandoned");

// —— 6. 标注填充 unknown_encounters ——
// benefit 出现 2 次；Kaiser 句中大写=proper；zzqxwibble=miss，均不得入表
const text = "The benefit of exercise is enormous and the benefit repeats again for Quixilvar zzqxwibble today.";
const a = reopened.annotateAndSave(text, "T1");
const rows = reopened.user.prepare("SELECT * FROM unknown_encounters WHERE text_id=?").all(a.text_id);
const ben = rows.find((r) => r.lemma === "benefit");
check("benefit 入相遇表且词频=2（不累加）", !!ben && ben.count === 2, ben ? String(ben.count) : "缺失");
check("proper（Quixilvar 生造专名）不入表", !rows.some((r) => /quixilvar/i.test(r.lemma)));
check("miss（zzqxwibble）不入表", !rows.some((r) => /zzqx/i.test(r.lemma)));
// 重新标注同一篇：词频覆盖而非累加
reopened.annotateAndSave(text, "T1");
const ben2 = reopened.user.prepare("SELECT * FROM unknown_encounters WHERE lemma='benefit' AND text_id=?").get(a.text_id);
check("重新标注后 count 仍为 2（覆盖不累加）", ben2.count === 2, String(ben2.count));

// —— 7. coverage 首标快照不可变 ——
let cov = reopened.user.prepare("SELECT * FROM coverage_assessments WHERE text_id=? AND kind='first_annotate'").all(a.text_id);
check("首标写一条覆盖率快照", cov.length === 1 && cov[0].total_tokens > 0 && cov[0].rate >= 0 && cov[0].rate <= 1);
const firstRate = cov[0].rate;
// 给 benefit 建卡（learned 增加），再重新标注：快照不追加、不改写
reopened.createNote({ word: "benefit", label: "word", phrase: null, sense: "n. 利益", textId: a.text_id, offset: text.indexOf("benefit") });
reopened.annotateAndSave(text, "T1");
cov = reopened.user.prepare("SELECT * FROM coverage_assessments WHERE text_id=? AND kind='first_annotate'").all(a.text_id);
check("成卡+重标后覆盖率快照仍只有一条且 rate 不变", cov.length === 1 && cov[0].rate === firstRate, `${cov.length}/${cov[0]?.rate}`);
// 成卡后旧相遇行保留（不删）
const ben3 = reopened.user.prepare("SELECT * FROM unknown_encounters WHERE lemma='benefit' AND text_id=?").get(a.text_id);
check("成卡后历史相遇行保留", !!ben3);
// 另一篇文章各自一条
const a2 = reopened.annotateAndSave("Another completely different passage about science and research methods.", "T2");
check("第二篇有独立首标快照",
  reopened.user.prepare("SELECT COUNT(*) n FROM coverage_assessments WHERE kind='first_annotate'").get().n === 2 &&
  !!reopened.user.prepare("SELECT 1 FROM coverage_assessments WHERE text_id=?").get(a2.text_id));

// —— 8. 存量回填（旧文章一次性补快照/相遇，且标记 backfilled）——
reopened.user.prepare("DELETE FROM coverage_assessments WHERE text_id=?").run(a2.text_id);
reopened.user.prepare("DELETE FROM unknown_encounters WHERE text_id=?").run(a2.text_id);
const covN = reopened.backfillCoverageAssessments();
const unkN = reopened.backfillUnknownEncounters();
const cov2 = reopened.user.prepare("SELECT * FROM coverage_assessments WHERE text_id=? AND kind='first_annotate'").get(a2.text_id);
check("回填覆盖率快照且标记 backfilled", covN >= 1 && cov2 && JSON.parse(cov2.snapshot_json).backfilled === true);
check("回填漏网词相遇", unkN >= 1 && reopened.user.prepare("SELECT COUNT(*) n FROM unknown_encounters WHERE text_id=?").get(a2.text_id).n > 0);
check("回填幂等（再次执行 coverage 不重复）", reopened.backfillCoverageAssessments() === 0);

reopened.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
