// V8-2b 对话会话/轮次方法回归：
// convCreate 校验与幂等、convAddTurn turn_key 幂等与 seq 自增、七态流转、
// convUpdateTurn 白名单与反馈 JSON、convClose、convList/convGet、turns_count、
// learning_sessions 支持 conversation/turns。
// 运行：node test/conv-session.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}
function rejects(name, fn) {
  let threw = false; let err = null;
  try { fn(); } catch (e) { threw = true; err = e; }
  check(name, threw, err ? String(err.message || err).slice(0, 80) : "");
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conv-sess-"));
const core = new Core(dir);

// —— 1. convCreate ——
rejects("空话题目标拒绝", () => core.convCreate({ goal: "  " }));
const sess = core.convCreate({ goal: "ordering food at a restaurant", cefr: "B1", suggestedTurns: 10,
  brainEngine: "local", brainModelRevision: "qwen2.5-3b-q4f32" });
check("会话创建 status=open", sess.status === "open");
check("title 取话题前 200 字", sess.title === "ordering food at a restaurant");
check("topic 落库", sess.topic.goal === "ordering food at a restaurant" &&
  sess.topic.cefr === "B1" && sess.topic.suggestedTurns === 10);
check("brain 元信息落库", sess.brainEngine === "local" && sess.brainModelRevision === "qwen2.5-3b-q4f32");
check("cefr_at_start 落库", sess.cefrAtStart === "B1");

const same = core.convCreate({ goal: "other", sessionKey: sess.sessionKey });
check("sessionKey 幂等返回同一行", same.id === sess.id && same.topic.goal === "ordering food at a restaurant");

const defaults = core.convCreate({ goal: "defaults check" });
check("默认 cefr=B2 / suggestedTurns=8",
  defaults.topic.cefr === "B2" && defaults.topic.suggestedTurns === 8);

// suggestedTurns 钳制
const clamped = core.convCreate({ goal: "clamp", suggestedTurns: 999 });
check("suggestedTurns 上限 40", clamped.topic.suggestedTurns === 40);

// —— 2. convAddTurn ——
rejects("未知会话加轮拒绝", () => core.convAddTurn({ sessionKey: "nope", turnKey: "t-x", role: "user", text: "hi" }));

const u1 = core.convAddTurn({ sessionKey: sess.sessionKey, turnKey: "t-u1", role: "user", text: "I want pasta" });
check("user 轮默认 status=user_confirmed / seq=0",
  u1.status === "user_confirmed" && u1.seq === 0);
const a1 = core.convAddTurn({ sessionKey: sess.sessionKey, turnKey: "t-a1", role: "assistant", text: "" });
check("assistant 轮默认 status=generating / seq=1",
  a1.status === "generating" && a1.seq === 1);

const u1again = core.convAddTurn({ sessionKey: sess.sessionKey, turnKey: "t-u1", role: "user", text: "changed" });
check("turn_key 幂等不重复插入", u1again.id === u1.id && u1again.text === "I want pasta");

const a1done = core.convUpdateTurn({ turnKey: "t-a1", status: "completed", text: "Great choice!", committedText: "Great choice!" });
check("assistant 轮可转 completed", a1done.status === "completed" && a1done.committedText === "Great choice!");

rejects("非法 status 更新被 CHECK 拒绝", () => core.convUpdateTurn({ turnKey: "t-a1", status: "bogus" }));

const u1fb = core.convUpdateTurn({ turnKey: "t-u1", localFeedback: ['"I want" → "I would like" — more polite'] });
check("轻纠错写入 localFeedback",
  Array.isArray(u1fb.localFeedback) && u1fb.localFeedback.length === 1);
const u1norm = core.convUpdateTurn({ turnKey: "t-u1", localFeedback: "not-array" });
check("localFeedback 非数组归一为空数组", Array.isArray(u1norm.localFeedback) && u1norm.localFeedback.length === 0);

// 播放游标
const cur = core.convUpdateTurn({ turnKey: "t-a1", status: "interrupted", playedCharEnd: 7, interruptedAt: Date.now() });
check("played_char_end / interrupted_at 保存", cur.playedCharEnd === 7 && typeof cur.interruptedAt === "number");

// turns_count 统计 user 轮
const s1 = core.convGet(sess.sessionKey);
check("turns_count=user 轮数", s1.session.turnsCount === 1);

// —— 3. convGet / convList ——
check("convGet turns 按 seq 升序",
  s1.turns.map((t) => t.seq).join(",") === "0,1");
const list = core.convList(20);
check("convList 含全部会话且按时间倒序",
  list.length === 3 && list[0].id === clamped.id);

// —— 4. convClose ——
const closed = core.convClose({ sessionKey: sess.sessionKey, activeMs: 12345 });
check("convClose status=closed / ended_at / active_ms",
  closed.status === "closed" && !!closed.endedAt && closed.activeMs === 12345);
const closed2 = core.convClose({ sessionKey: sess.sessionKey, activeMs: 99999 });
check("重复 close 幂等不改 active_ms", closed2.activeMs === 12345);
const abandoned = core.convClose({ sessionKey: defaults.sessionKey, status: "abandoned", activeMs: 1 });
check("abandoned 状态", abandoned.status === "abandoned");

// —— 5. learning_sessions conversation/turns ——
const ls = core.beginSession({
  kind: "conversation", sessionKey: "conv-ls-1",
  refType: "conversation", refId: sess.sessionKey, titleSnapshot: "ordering food",
  unit: "turns", amount: 2,
});
check("beginSession 支持 conversation/turns", ls.kind === "conversation" && ls.unit === "turns");
rejects("beginSession 拒绝非法 kind", () => core.beginSession({ kind: "bogus", sessionKey: "x" }));
const lsBadUnit = core.beginSession({ kind: "conversation", sessionKey: "conv-ls-2", unit: "bogus" });
check("beginSession 非法 unit 归一为空", lsBadUnit.unit === "");

// —— 6. convRecover 崩溃恢复 ——
const recSess = core.convCreate({ goal: "recover me", cefr: "B1" });
const genKey = `turn:${crypto.randomUUID()}`;
const spkKey = `turn:${crypto.randomUUID()}`;
core.convAddTurn({ sessionKey: recSess.sessionKey, turnKey: genKey, role: "assistant", text: "", status: "generating" });
core.convAddTurn({ sessionKey: recSess.sessionKey, turnKey: spkKey, role: "assistant", text: "Full sentence.", status: "speaking", committedText: "Full" });
const r = core.convRecover();
check("convRecover 处理两条未完成轮次", r.recovered === 2);
const after = core.convGet(recSess.sessionKey);
const genTurn = after.turns.find((t) => t.turnKey === genKey);
const spkTurn = after.turns.find((t) => t.turnKey === spkKey);
check("generating → failed / 稳定错误码", genTurn.status === "failed" && genTurn.errorCode === "interrupted_by_restart");
check("speaking → interrupted / 已播前缀保留", spkTurn.status === "interrupted" && spkTurn.committedText === "Full");
check("convRecover 二次运行零处理", core.convRecover().recovered === 0);

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n# fail ${fail}`);
process.exit(fail ? 1 : 0);
