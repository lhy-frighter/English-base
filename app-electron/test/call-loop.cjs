// S14 通话数据闭环测试：按 VoiceCallPage/CallEngine 挂断与复盘时的真实调用形态驱动 core：
//   convCreate(call: 前缀) → 用户轮(ASR)/助手轮(完成/打断前缀) → convClose → learning_sessions 收口
//   → debriefPut(整句 chunk 候选) → 草稿列表可恢复 → captureAsset 批量加入复习（幂等）→ debriefSetStatus(done)
// 运行：node test/call-loop.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "call-loop-"));
const core = new Core(dir);
const db = core.user;

(async () => {
  // —— 1) 通话开始：页面 beginSessionRecord 的调用形态 ——
  const sessionKey = "call:" + "0b9e6c1e-1111-4aaa-9bbb-2c2d3e4f5a6b";
  const title = "通话·自由对话·my internship";
  const sess = core.convCreate({
    sessionKey, goal: title, cefr: "B2", suggestedTurns: 8, brainEngine: "realtime",
  });
  check("convCreate(call: 前缀) 建会话", sess.sessionKey === sessionKey && sess.status === "open");
  const learnKey = "conversation:" + sessionKey;
  core.beginSession({
    kind: "conversation", sessionKey: learnKey, refType: "conversation",
    refId: sessionKey, titleSnapshot: title, unit: "turns", amount: 0,
  });
  check("learning_sessions(kind=conversation) 建立",
    !!db.prepare("SELECT 1 FROM learning_sessions WHERE session_key=? AND kind='conversation'").get(learnKey));

  // —— 2) 通话中：用户轮（ASR 转写）+ 助手轮（完成 / 打断前缀）——
  const u1 = core.convAddTurn({
    sessionKey, turnKey: "callturn:u1", role: "user",
    text: "Hi, what shall we talk about today?", status: "user_confirmed", asrEngine: "server",
  });
  check("用户轮落库(asrEngine=server)", u1.role === "user" && u1.text.includes("talk about"));
  const a1 = core.convAddTurn({
    sessionKey, turnKey: "callturn:a1", role: "assistant",
    text: "Let's talk about your internship. What did you do every day?",
    status: "completed", provider: "realtime",
  });
  check("助手完成轮落库", a1.status === "completed");
  // barge-in：用户只听到了前半句
  const a2 = core.convAddTurn({
    sessionKey, turnKey: "callturn:a2", role: "assistant",
    text: "I remember when I was", committedText: "I remember when I was",
    status: "interrupted", provider: "realtime",
  });
  check("打断轮以前缀落库", a2.status === "interrupted" && a2.committedText === "I remember when I was");
  // 用出证据检测（S13-b 口径；预置一个 chunk 资产供命中）
  const seeded = core.captureAsset({
    asset_kind: "chunk", canonical: "put up with", gloss: "忍受",
    payload: { example_en: "I cannot put up with the noise." },
    idempotency_key: "seed-1",
  });
  const used = core.detectUsedAssets({
    sessionKey, turnKey: "callturn:u2", text: "I cannot put up with the noise anymore.", prompted: [],
  });
  check("通话用户轮触发用出证据(used_spontaneously)", used.some((x) => x.asset_id === seeded.asset_id && x.result === "used_spontaneously"));

  // —— 3) 挂断：convClose + sessionClose ——
  core.convClose({ sessionKey, activeMs: 95_000, status: "closed" });
  core.closeSession(learnKey, { activeMs: 95_000, amount: 2 });
  check("convClose 收口", core.convGet(sessionKey).session.status === "closed");
  check("学习会话收口(amount=用户轮数)",
    db.prepare("SELECT status, amount FROM learning_sessions WHERE session_key=?").get(learnKey).status === "closed");

  // —— 4) 复盘：DebriefPanel 候选形态（整句 chunk）→ 草稿持久化 → 今日页可恢复 ——
  const candidates = [
    { kind: "chunk", canonical: "Let's talk about your internship. What did you do every day?", sentence: "Let's talk about your internship. What did you do every day?" },
  ];
  core.debriefPut({ origin_kind: "conversation", origin_ref: sessionKey, candidates });
  const draft = core.debriefGet("conversation:" + sessionKey);
  check("复盘草稿持久化", !!draft && draft.status === "open"
    && JSON.parse(draft.candidates_json).length === 1);
  check("草稿出现在今日待复盘列表", core.debriefList().some((d) => d.draft_key === "conversation:" + sessionKey));

  // —— 5) 批量加入复习：DebriefPanel confirm 的 captureAsset 形态（幂等键 debrief-conversation-<ref>-chunk-<i>）——
  const enc = { origin_kind: "conversation", origin_ref: sessionKey, title, sentence: candidates[0].sentence };
  const r1 = core.captureAsset({
    asset_kind: "chunk", canonical: candidates[0].canonical, gloss: "",
    payload: {}, test_point: "",
    idempotency_key: "debrief-conversation-" + sessionKey + "-chunk-0",
    encounter: enc,
  });
  check("整句加入复习建卡(2 卡)", r1.created === true && r1.cards_created === 2);
  const r2 = core.captureAsset({
    asset_kind: "chunk", canonical: candidates[0].canonical, gloss: "",
    payload: {}, test_point: "",
    idempotency_key: "debrief-conversation-" + sessionKey + "-chunk-0",
    encounter: enc,
  });
  check("重复复盘幂等（不重建不重计）", r2.created === false && r2.replayed === true);
  core.debriefSetStatus("conversation:" + sessionKey, "done");
  check("复盘完成后草稿出队", !core.debriefList().some((d) => d.draft_key === "conversation:" + sessionKey));
  // 复盘资产可被复习队列取到
  const due = core.getDue(20);
  check("复盘 chunk 进入复习队列", due.some((c) => c.asset_id === r1.asset_id));

  // —— 6) 对话历史可见：convList 含通话记录 ——
  check("通话出现在对话历史列表", core.convList(20).some((c) => c.sessionKey === sessionKey));

  console.log(`\ncall-loop: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
