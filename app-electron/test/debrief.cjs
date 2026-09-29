// S13-a-2 复盘草稿 + 来源反向视图契约：
// 1) debriefPut upsert/校验；2) list/get/status；3) textDebriefCandidates（查过未建卡→建卡后排除、带句）；
// 4) textLearnedSummary；5) conversationSummary。
// 运行：node test/debrief.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}
function throws(name, fn) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  check(name, threw);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "debrief-"));
const core = new Core(dir);
const db = core.user;

// —— 1. debriefPut：插入 + 更新 + 校验 ——
const r1 = core.debriefPut({
  origin_kind: "reading", origin_ref: "7",
  candidates: [{ kind: "chunk", canonical: "up to you", gloss: "由你决定" }],
});
check("debriefPut 插入草稿", r1.draft_key === "reading:7");
const g1 = core.debriefGet("reading:7");
check("草稿候选持久化", (() => {
  try { return (JSON.parse(g1.candidates_json)).length === 1; } catch { return false; }
})());
core.debriefPut({
  origin_kind: "reading", origin_ref: "7",
  candidates: [{ kind: "word", canonical: "benefit", gloss: "利益" }],
});
check("debriefPut 同 origin 更新（不新增）",
  db.prepare("SELECT COUNT(*) n FROM debrief_drafts").get().n === 1 &&
  JSON.parse(core.debriefGet("reading:7").candidates_json)[0].canonical === "benefit");
throws("origin_kind 非法被拒", () =>
  core.debriefPut({ origin_kind: "nope", origin_ref: "1", candidates: [] }));
throws("origin_ref 空被拒", () =>
  core.debriefPut({ origin_kind: "exam", origin_ref: "", candidates: [] }));

// —— 2. list / status ——
core.debriefPut({ origin_kind: "conversation", origin_ref: "sess-1", candidates: [] });
check("debriefList 含 2 条 open", core.debriefList().length === 2);
core.debriefSetStatus("reading:7", "done");
check("done 后 open 列表排除", core.debriefList().length === 1);
check("done 后 Put 不复活", (() => {
  core.debriefPut({ origin_kind: "reading", origin_ref: "7", candidates: [] });
  return core.debriefGet("reading:7").status === "done";
})());
core.debriefSetStatus("conversation:sess-1", "skipped");
check("skipped 状态写入", core.debriefGet("conversation:sess-1").status === "skipped");
throws("status 非法被拒", () => core.debriefSetStatus("reading:7", "bad"));

// —— 3. textDebriefCandidates：查过未建卡 → 建卡后排除 ——
const a = core.annotateAndSave(
  "This benefit is clearly demonstrated. Another benefit appears here too.", "t1");
const lk = core.lookup("benefit", "word", null, a.text_id);
check("lookup 有结果并写 lookup_log", !!lk &&
  db.prepare("SELECT COUNT(*) n FROM lookup_log WHERE text_id=?").get(a.text_id).n >= 1);
let cs = core.textDebriefCandidates(a.text_id);
check("查过未建卡→候选含 benefit",
  cs.some((c) => c.kind === "word" && c.canonical === "benefit"),
  JSON.stringify(cs.map((x) => x.canonical)));
check("候选带语境句", cs.every((c) => !!c.sentence));
const noteR = core.createNote({
  word: "benefit", label: "word", phrase: null,
  sense: "利益", textId: a.text_id, offset: 5,
});
check("createNote 建卡", noteR.cards_created >= 1);
cs = core.textDebriefCandidates(a.text_id);
check("建卡后候选排除该词", !cs.some((c) => c.canonical === "benefit"));

// —— 4. textLearnedSummary ——
const sum = core.textLearnedSummary(a.text_id);
check("反向视图：已学词 1", sum.words === 1, JSON.stringify(sum));
// 追加一个 chunk 资产（相遇来源本文）
core.captureAsset({
  asset_kind: "chunk", canonical: "look forward to", gloss: "期待",
  payload: {}, idempotency_key: "cap-look",
  encounter: {
    origin_kind: "reading", origin_ref: String(a.text_id), locator_hash: "loc-a",
    title: "t1", sentence: "I look forward to it.",
  },
});
const sum2 = core.textLearnedSummary(a.text_id);
check("反向视图：chunk 资产 1", sum2.assets.chunk === 1, JSON.stringify(sum2.assets));

// —— 5. conversationSummary ——
const sessKey = "sess-x";
const nowTs = Date.now();
db.prepare(`INSERT INTO conversation_sessions
  (session_key,title,topic_json,started_at,last_active_at,status,active_ms,cefr_at_start,turns_count)
  VALUES(?,?,?,?,?,?,?,?,?)`)
  .run(sessKey, "Travel", "{}", nowTs, nowTs, "closed", 0, "B1", 1);
const sessId = db.prepare("SELECT id FROM conversation_sessions WHERE session_key=?").get(sessKey).id;
db.prepare(`INSERT INTO conversation_turns
  (session_id,seq,turn_key,role,text,status,committed_text,created_at)
  VALUES(?,?,?,?,?,?,?,?)`)
  .run(sessId, 0, "u1", "user", "I look forward to it", "completed", "I look forward to it", nowTs);
const cap = core.captureAsset({
  asset_kind: "chunk", canonical: "look forward to", gloss: "期待",
  payload: {}, idempotency_key: "cap-conv",
  encounter: {
    origin_kind: "conversation", origin_ref: "u1", locator_hash: "loc-c",
    title: "chat", sentence: "I look forward to it",
  },
});
core.addAssetEvidence({
  asset_id: cap.asset_id, dimension: "chunk_use", result: "used_spontaneously",
  source_kind: "conversation", source_ref: "u1", idempotency_key: "ev-sp-1",
});
const csum = core.conversationSummary(sessKey);
check("对话视图：沉淀 1 资产", csum.assets === 1 && csum.assetKinds.chunk === 1,
  JSON.stringify(csum));
check("对话视图：自然用出 1", csum.evidence.used_spontaneously === 1,
  JSON.stringify(csum.evidence));

// —— 6. detectUsedAssets 用出证据三分类 ——
const mkSession = (key) => {
  const t = Date.now();
  db.prepare(`INSERT INTO conversation_sessions
    (session_key,title,topic_json,started_at,last_active_at,status,active_ms,cefr_at_start,turns_count)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(key, key, "{}", t, t, "open", 0, "B1", 0);
  return db.prepare("SELECT id FROM conversation_sessions WHERE session_key=?").get(key).id;
};
const addAsst = (sessId, seq, feedback, text) =>
  db.prepare(`INSERT INTO conversation_turns
    (session_id,seq,turn_key,role,text,status,committed_text,local_feedback_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(sessId, seq, "a" + seq + ":" + sessId, "assistant", text, "completed", text,
      JSON.stringify(feedback), Date.now());

// 6.1 spontaneous：无纠错前情，用户自然用出 chunk
const s2 = mkSession("sess-2");
const det1 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-1", text: "I look forward to seeing you",
});
check("用出检测：spontaneous chunk",
  det1.some((d) => d.result === "used_spontaneously"), JSON.stringify(det1));

// 6.2 每会话同类证据至多一条（再用出 → replayed）
const det2 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-2", text: "I look forward to it too",
});
check("用出检测：同会话重复 → replayed",
  det2.every((d) => d.replayed === true), JSON.stringify(det2));

// 6.3 中文轮不评估
const det3 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-3", text: "我期待这个",
});
check("用出检测：中文轮空", det3.length === 0);

// 6.4 after_correction：上一条 assistant 纠错含该 chunk
const s4 = mkSession("sess-4");
addAsst(s4, 0, [{ correction: "You should say: I look forward to it." }],
  "Try: I look forward to it.");
const det4 = core.detectUsedAssets({
  sessionKey: "sess-4", turnKey: "u4-1", text: "I look forward to it",
});
check("用出检测：纠正后立即重说 → after_correction",
  det4.some((d) => d.result === "used_after_correction"), JSON.stringify(det4));

// 6.5 单词边界：word 资产 "art" 不命中 party
db.prepare("INSERT INTO lexemes (lemma,pos,sense,created_at) VALUES('art','n','艺术',?)")
  .run(Date.now());
const artLexId = db.prepare("SELECT id FROM lexemes WHERE lemma='art'").get().id;
db.prepare(`INSERT INTO learning_assets
  (asset_kind,canonical,gloss,payload_json,lexeme_id,identity_key,status,created_at,idempotency_key)
  VALUES('word','art','艺术','{}',?,'lex:art','active',?,?)`)
  .run(artLexId, Date.now(), "word-art-1");
const det5 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-4", text: "the party was fun",
});
check("用出检测：单词边界（art 不命中 party）",
  !det5.some((d) => d.asset_id === db.prepare(
    "SELECT id FROM learning_assets WHERE identity_key='lex:art'").get().id));
const det6 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-5", text: "modern art is amazing",
});
check("用出检测：art 正确命中", det6.some((d) => {
  const id = db.prepare("SELECT id FROM learning_assets WHERE identity_key='lex:art'").get().id;
  return d.asset_id === id && d.result === "used_spontaneously";
}), JSON.stringify(det6));

// 6.6 中英混说：英文片段仍评估 chunk
const det7 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-6", text: "我很 look forward to 明天",
});
check("用出检测：中英混说英文片段评估",
  det7.some((d) => d.replayed === true || d.result === "used_spontaneously"),
  JSON.stringify(det7));

// 6.7 引导用出：prompted 资产 → used_prompted
const chunkAssetId = core.findAssetByCanonical("chunk", "look forward to");
check("chunk 资产可定位", chunkAssetId != null);
const s7 = mkSession("sess-7");
const det8 = core.detectUsedAssets({
  sessionKey: "sess-7", turnKey: "u7-1",
  text: "I look forward to it", prompted: [chunkAssetId],
});
check("引导用出 → used_prompted",
  det8.some((d) => d.asset_id === chunkAssetId && d.result === "used_prompted"),
  JSON.stringify(det8));

// 6.8 assetUseCounts 汇总
const uc = core.assetUseCounts(chunkAssetId);
check("用出次数：spontaneous≥1 prompted≥1 after≥1",
  uc.used_spontaneously >= 1 && uc.used_prompted >= 1 && uc.used_after_correction >= 1,
  JSON.stringify(uc));

// 7.1 priority 结构与 algo
const p = core.assetPriority(chunkAssetId);
check("priority 结构与 algo",
  p.algo === "priority-v1" && p.parts && typeof p.score === "number",
  JSON.stringify(p));

// 7.2 priorityList 有序、带 canonical（先造一个有错误证据、无成功证据的弱点资产）
const weakRes = core.captureAsset({
  asset_kind: "chunk", canonical: "on the other hand", gloss: "另一方面",
  payload: { zh_intent: "对比转折" },
  encounter: {
    origin_kind: "conversation", origin_ref: "seed-weak",
    title_snapshot: "seed",
    sentence_snapshot: "On the other hand, it is cheap.",
  },
  idempotency_key: "seed-weak-chunk",
});
core.addAssetEvidence({
  asset_id: weakRes.asset_id, dimension: "chunk_use", result: "wrong",
  source_kind: "conversation", source_ref: "seed-weak",
  payload: {}, idempotency_key: "seed-weak-wrong",
});
const pl = core.priorityList({ limit: 3 });
check("priorityList 有序且带 canonical",
  pl.length > 0
    && pl.some((x) => x.canonical === "on the other hand")
    && pl.every((x, i) => i === 0 || pl[i - 1].score >= x.score)
    && typeof pl[0].canonical === "string"
    && typeof pl[0].asset_kind === "string",
  JSON.stringify(pl.map((x) => [x.canonical, x.score])));

// 7.3 不存在资产抛错
let threw7 = false;
try { core.assetPriority(999999); } catch { threw7 = true; }
check("priority 不存在资产抛错", threw7);

// 8.1 对话来源句跟读通过链（1/3/7 走完 → graduated，origin 保留）
const convSent = "Nice to meet you";
const sp1 = core.shadowPractice({
  sentence: convSent, originKind: "conversation", originRef: "turn-xyz", similarity: 90,
});
check("新句 stage0", sp1.isNew && sp1.stage === 0, JSON.stringify(sp1));
const advance8 = () => {
  const row = db.prepare("SELECT id FROM shadow_sentences WHERE sentence_hash=?").get(sp1.hash);
  db.prepare("UPDATE shadow_sentences SET due_at=? WHERE id=?").run(Date.now() - 1000, row.id);
  return core.shadowPractice({
    sentence: convSent, originKind: "conversation", originRef: "turn-xyz", similarity: 95,
  });
};
const a1 = advance8(); check("推进 stage1", a1.stage === 1 && a1.advanced);
const a2 = advance8(); check("推进 stage2", a2.stage === 2);
const a3 = advance8(); check("graduated", Boolean(a3.graduated) && a3.status === "graduated");
check("turn 通过查询", core.shadowPassedForTurn("turn-xyz") === true);
check("turn 未通过查询", core.shadowPassedForTurn("turn-missing") === false);
const flags8 = core.shadowPassedForSentences({
  sentences: [convSent, "an unrelated sentence"],
});
check("句通过查询", flags8[0] === true && flags8[1] === false, JSON.stringify(flags8));
throws("originKind 非法抛错", () =>
  core.shadowPractice({ sentence: convSent, originKind: "bad" }));

// 9.1 考试错题跨域：听力/阅读错题进薄弱清单，字段与题型正确
const CROSS_MD = `# 跨域错题卷
::meta kind=cet6
## Listening
::kind listening
[00:03] M: I would like a ticket please.
### Q1
What does the man want?
- A) A ticket
- B) A refund
- C) A map
- D) A seat
> answer: A
> point: 听力细节
## Reading
The committee published a new regulation on campus parking.
### Q2
The word regulation is closest in meaning to ___.
- A) ceremony
- B) rule
- C) product
- D) subsidy
> answer: B
> point: 词汇题
`;
const crossImp = core.importPaper(CROSS_MD);
check(  "两题解析入库", crossImp.nQuestions === 2, String(crossImp.nQuestions));
core.gradeAttempt(crossImp.id, { 0: "B", 1: "A" }, Date.now());
const weak = core.examWeakList({ limit: 5 });
check("薄弱清单收 2 题", weak.length === 2, String(weak.length));
const wLis = weak.find((w) => w.is_listening);
const wRead = weak.find((w) => !w.is_listening);
check("听力题识别为 listening", !!wLis && wLis.section_kind.includes("listen"),
  JSON.stringify(weak.map((w) => w.section_kind)));
check("阅读题非 listening", !!wRead && !wRead.is_listening);
check("题干/答案/考点带出",
  wLis.stem.includes("man want") && wLis.answer === "A" && wLis.point.includes("听力"),
  JSON.stringify([wLis.stem, wLis.answer, wLis.point]));
check("阅读题字段带出",
  wRead.stem.includes("regulation") && wRead.answer === "B" && wRead.point.includes("词汇"));
check("limit 生效", core.examWeakList({ limit: 1 }).length === 1);

console.log(`\ndebrief: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
