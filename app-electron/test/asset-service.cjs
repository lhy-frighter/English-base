// #139B 统一资产服务契约：
// 1) 五类资产创建与卡片工厂数量/类型；2) identity 去重（跨入口/跨位置只追加 encounter）；
// 3) idempotency 重放零写入；4) relations；5) 校验失败零写库；6) 覆盖率/lexemes 隔离；7) 队列可取。
// 运行：node test/asset-service.cjs
const { Core, normalizeExpression, assetIdentity } = require("../core.cjs");
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
const now = Date.now();
let n = 0;
const idem = () => `cap-${n++}`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asset-svc-"));
const core = new Core(dir);
const db = core.user;
const counts = () => ({
  assets: db.prepare("SELECT COUNT(*) n FROM learning_assets").get().n,
  encounters: db.prepare("SELECT COUNT(*) n FROM asset_encounters").get().n,
  cards: db.prepare("SELECT COUNT(*) n FROM cards").get().n,
  lexemes: db.prepare("SELECT COUNT(*) n FROM lexemes").get().n,
  relations: db.prepare("SELECT COUNT(*) n FROM asset_relations").get().n,
});

// —— 1. chunk 创建：1 资产 + 2 卡 + 1 encounter ——
let c0 = counts();
const r1 = core.captureAsset({
  asset_kind: "chunk",
  canonical: "It's Up To You",
  gloss: "由你决定",
  payload: { variants: ["it is up to you"], register: "spoken", example_en: "It's up to you now." },
  idempotency_key: idem(),
  encounter: {
    origin_kind: "conversation", origin_ref: "turn-1",
    locator: { pi: 1 }, locator_hash: "loc-1",
    title: "Chat", sentence: "It's up to you now.",
  },
});
let c1 = counts();
check("chunk 资产创建", r1.created && c1.assets === c0.assets + 1);
check("chunk 生成 2 卡（recall+cloze）", r1.cards_created === 2 && c1.cards === c0.cards + 2,
  String(r1.cards_created));
check("encounter 记录 1 条", r1.encounter_added && c1.encounters === c0.encounters + 1);
const cardTypes = db.prepare("SELECT card_type FROM cards WHERE asset_id=? ORDER BY card_type")
  .all(r1.asset_id).map((x) => x.card_type);
check("卡类型为 chunk_recall/chunk_cloze",
  JSON.stringify(cardTypes) === JSON.stringify(["chunk_cloze", "chunk_recall"]), JSON.stringify(cardTypes));

// 身份规范化：大小写/弯引号折叠
check("identity 规范化（lowercase+引号）",
  normalizeExpression("It’s   Up To You") === "it's up to you");

// —— 2. 同 idempotency_key 重放：零写入 ——
const replay = core.captureAsset({
  asset_kind: "chunk", canonical: "It's Up To You", idempotency_key: r1.asset_id ? "cap-0" : "x",
});
// 直接用第一次的 idempotency key（cap-0）
const replay2 = core.captureAsset({
  asset_kind: "chunk", canonical: "It's Up To You", idempotency_key: "cap-0",
});
let c2 = counts();
check("重放不写库（replayed）", replay2.replayed &&
  c2.assets === c1.assets && c2.cards === c1.cards && c2.encounters === c1.encounters);

// —— 3. 同资产同篇第二位置：同资产、第二 encounter、无新卡 ——
const r3 = core.captureAsset({
  asset_kind: "chunk", canonical: "it's up to you",
  idempotency_key: idem(),
  encounter: {
    origin_kind: "conversation", origin_ref: "turn-1",
    locator: { pi: 2 }, locator_hash: "loc-2",
    title: "Chat", sentence: "Well, it's up to you.",
  },
});
let c3 = counts();
check("第二位置不重建资产", !r3.created && r3.asset_id === r1.asset_id);
check("第二位置追加 encounter", r3.encounter_added && c3.encounters === c2.encounters + 1);
check("第二位置不新建卡", r3.cards_created === 0 && c3.cards === c2.cards);

// —— 4. 同资产换来源（reading）：第三次相遇 ——
const r4 = core.captureAsset({
  asset_kind: "chunk", canonical: "it's up to you",
  idempotency_key: idem(),
  encounter: {
    origin_kind: "reading", origin_ref: "7",
    locator: { pi: 3 }, locator_hash: "loc-3",
    title: "Article", sentence: "The choice is up to you.",
  },
});
check("跨来源第三 encounter", r4.encounter_added &&
  db.prepare("SELECT COUNT(*) n FROM asset_encounters WHERE asset_id=?").get(r1.asset_id).n === 3);
// 重复提交同一 encounter（同 locator_hash）→ 不重复
const r4b = core.captureAsset({
  asset_kind: "chunk", canonical: "it's up to you",
  idempotency_key: idem(),
  encounter: { origin_kind: "reading", origin_ref: "7", locator: { pi: 3 }, locator_hash: "loc-3" },
});
check("同 encounter 重提不重复", !r4b.encounter_added && !r4b.created);

// —— 5. grammar / pronunciation / concept 卡片数量 ——
const rg = core.captureAsset({
  asset_kind: "grammar", canonical: "used to + infinitive",
  gloss: "过去常常", payload: { exercise_form: "transformation" },
  idempotency_key: idem(),
});
check("grammar 1 资产 1 卡", rg.created && rg.cards_created === 1, String(rg.cards_created));

const rp = core.captureAsset({
  asset_kind: "pronunciation", canonical: "thought",
  gloss: "注意 /θ/ 音", payload: { problem_type: "segmental", ipa: "/θɔːt/" },
  idempotency_key: idem(),
});
check("pronunciation 仅建听辨 1 卡", rp.created && rp.cards_created === 1, String(rp.cards_created));
check("听辨阶段无产出卡",
  db.prepare("SELECT COUNT(*) n FROM cards WHERE asset_id=? AND card_type='pron_production'")
    .get(rp.asset_id).n === 0);
// 产出链确认后才补产出卡
const pp = core.addPronProductionCard(rp.asset_id);
check("产出链确认后补 pron_production", pp.created);
check("产出卡重复调用不重建", !core.addPronProductionCard(rp.asset_id).created);

const rc = core.captureAsset({
  asset_kind: "concept", canonical: "细节题定位",
  gloss: "题干关键词回文定位",
  payload: { test_point: "reading-detail" },
  paper_id: "p1", q_index: "3", test_point: "reading-detail",
  idempotency_key: idem(),
});
check("concept 1 资产 1 卡", rc.created && rc.cards_created === 1);
// concept 身份稳定：同卷同题同考点 → 同资产
const rc2 = core.captureAsset({
  asset_kind: "concept", canonical: "细节题定位（文案略改）",
  payload: { test_point: "reading-detail" },
  paper_id: "p1", q_index: "3", test_point: "reading-detail",
  idempotency_key: idem(),
});
check("concept 业务键去重", !rc2.created && rc2.asset_id === rc.asset_id);

// —— 6. word 资产：关联 lexeme、不拥有卡 ——
const lexId = db.prepare("INSERT INTO lexemes(lemma,pos,sense,created_at) VALUES('svcword','n','释义',?)")
  .run(now).lastInsertRowid;
const rw = core.captureAsset({
  asset_kind: "word", canonical: "svcword", lexeme_id: lexId,
  idempotency_key: idem(),
  encounter: { origin_kind: "syllabus", origin_ref: "cet6", locator_hash: "w1" },
});
check("word 资产创建且 0 卡（卡归 note 管线）", rw.created && rw.cards_created === 0);
const rw2 = core.captureAsset({
  asset_kind: "word", canonical: "svcword", lexeme_id: lexId,
  idempotency_key: idem(),
});
check("word 资产重复不重建", !rw2.created && rw2.asset_id === rw.asset_id);

// —— 7. relations ——
const rr = core.captureAsset({
  asset_kind: "chunk", canonical: "you know what",
  idempotency_key: idem(),
  relations: [{ rel: "variant_of", target_kind: "chunk", target_identity: assetIdentity("chunk", { canonical: "it's up to you" }) }],
});
check("relation 写入 1 条", rr.relations_added === 1, String(rr.relations_added));
check("relation 落库",
  db.prepare("SELECT COUNT(*) n FROM asset_relations WHERE from_asset=? AND rel='variant_of'")
    .get(rr.asset_id).n === 1);
// 重复 relation 不重复计
const rr2 = core.captureAsset({
  asset_kind: "chunk", canonical: "you know what",
  idempotency_key: idem(),
  relations: [{ rel: "variant_of", target_kind: "chunk", target_identity: assetIdentity("chunk", { canonical: "it's up to you" }) }],
});
check("relation 幂等", rr2.relations_added === 0);

// —— 8. 校验失败零写库 ——
const before = counts();
throws("asset_kind 非法", () => core.captureAsset({ asset_kind: "nope", canonical: "x", idempotency_key: idem() }));
throws("canonical 空", () => core.captureAsset({ asset_kind: "chunk", canonical: "  ", idempotency_key: idem() }));
throws("idempotency_key 空", () => core.captureAsset({ asset_kind: "chunk", canonical: "x", idempotency_key: "" }));
throws("payload 非对象", () => core.captureAsset({ asset_kind: "chunk", canonical: "x", payload: [], idempotency_key: idem() }));
throws("word 缺 lexeme_id", () => core.captureAsset({ asset_kind: "word", canonical: "x", idempotency_key: idem() }));
throws("chunk 挂 lexeme_id", () => core.captureAsset({ asset_kind: "chunk", canonical: "x", lexeme_id: 1, idempotency_key: idem() }));
throws("encounter origin 非法", () => core.captureAsset({
  asset_kind: "chunk", canonical: "z", idempotency_key: idem(),
  encounter: { origin_kind: "bad", locator_hash: "z1" },
}));
const after = counts();
check("全部失败请求零写库", JSON.stringify(before) === JSON.stringify(after));

// —— 9. 覆盖率/lexemes 隔离 ——
check("chunk/grammar/pron/concept 不进 lexemes",
  after.lexemes === before.lexemes);

// —— 10. 队列：新资产卡可被 getDue 取出 ——
const due = core.getDue(20);
const dueAssetKinds = {};
for (const d of due) {
  if (d.asset_id != null) {
    const a = db.prepare("SELECT asset_kind FROM learning_assets WHERE id=?").get(d.asset_id);
    dueAssetKinds[a.asset_kind] = (dueAssetKinds[a.asset_kind] || 0) + 1;
  }
}
check("队列含 chunk/grammar/pron/concept 资产卡",
  (dueAssetKinds.chunk || 0) >= 1 && (dueAssetKinds.grammar || 0) >= 1 &&
  (dueAssetKinds.pronunciation || 0) >= 1 && (dueAssetKinds.concept || 0) >= 1,
  JSON.stringify(dueAssetKinds));

// —— 11. findAssetByCanonical + addAssetEvidence（跟读 inline drill 前置） ——
const pronR = core.captureAsset({
  asset_kind: "pronunciation",
  canonical: "Benefit",
  payload: { ipa: "/ˈbenɪfɪt/", problem_type: "segmental" },
  idempotency_key: idem(),
});
check("findAssetByCanonical 命中（大小写/空白不敏感）",
  core.findAssetByCanonical("pronunciation", "  benefit ") === pronR.asset_id);
check("findAssetByCanonical 未命中返回 null",
  core.findAssetByCanonical("pronunciation", "no-such-word") === null);
throws("findAssetByCanonical kind 非法", () =>
  core.findAssetByCanonical("nope", "x"));
const ev1 = core.addAssetEvidence({
  asset_id: pronR.asset_id, dimension: "word_rerecord",
  result: "practice_observation", source_kind: "shadow", source_ref: "shadow",
  payload: { text_match: 80 }, idempotency_key: "ev-obs-1",
});
check("addAssetEvidence 写入", ev1.replayed === false);
const ev2 = core.addAssetEvidence({
  asset_id: pronR.asset_id, dimension: "word_rerecord",
  result: "improved", source_kind: "shadow", source_ref: "shadow",
  idempotency_key: "ev-imp-1",
});
check("addAssetEvidence improved 写入", ev2.replayed === false);
check("addAssetEvidence 幂等重放",
  core.addAssetEvidence({
    asset_id: pronR.asset_id, dimension: "word_rerecord",
    result: "improved", source_kind: "shadow", idempotency_key: "ev-imp-1",
  }).replayed === true);
throws("addAssetEvidence 非法 result 被拒", () =>
  core.addAssetEvidence({
    asset_id: pronR.asset_id, dimension: "d", result: "nope",
    source_kind: "shadow", idempotency_key: "ev-bad",
  }));
throws("addAssetEvidence 资产不存在被拒", () =>
  core.addAssetEvidence({
    asset_id: 99999, dimension: "d", result: "improved",
    source_kind: "shadow", idempotency_key: "ev-missing",
  }));

// —— 12. 复习链路：资产卡答题必须写 asset_evidence（回归：此前 note_id=NULL 直接崩）——
{
  const dueAll = core.getDue(20);
  const assetCard = dueAll.find((c) => c.asset_id != null && c.card_type === "chunk_recall");
  check("复习队列含 chunk_recall 资产卡", !!assetCard);
  if (assetCard) {
    const evBefore = db.prepare("SELECT COUNT(*) n FROM asset_evidence WHERE asset_id=?").get(assetCard.asset_id).n;
    const res = core.answer({ cardId: assetCard.card_id, rating: 3, elapsedMs: 4000 });
    check("资产卡 answer 不抛错且返回调度", Number(res.interval_days) >= 0 && !!res.due_ms);
    const evRow = db.prepare(
      "SELECT * FROM asset_evidence WHERE asset_id=? ORDER BY id DESC LIMIT 1").get(assetCard.asset_id);
    check("资产卡 answer 写 asset_evidence(correct/review)",
      !!evRow && evRow.result === "correct" && evRow.source_kind === "review"
      && evRow.dimension === "chunk_review"
      && evRow.source_ref === "card:" + assetCard.card_id,
      JSON.stringify(evRow || {}));
    check("资产卡 answer 恰好新增一条证据",
      db.prepare("SELECT COUNT(*) n FROM asset_evidence WHERE asset_id=?").get(assetCard.asset_id).n === evBefore + 1);
    core.answer({ cardId: assetCard.card_id, rating: 2, elapsedMs: 1000 });
    check("资产卡二次答题记 partial（FSRS 推进不崩）",
      db.prepare("SELECT result r FROM asset_evidence WHERE asset_id=? ORDER BY id DESC LIMIT 1")
        .get(assetCard.asset_id).r === "partial");
  }
  // 词卡（note 链路）回归：本夹具原本只有资产卡，建一张词表卡再答题
  core.createStandaloneNote({ word: "example", label: "word", phrase: false, sense: "例子；样本" });
  const noteCard = core.getDue(20).find((c) => c.note_id != null);
  check("复习队列含词卡（note 链路样本）", !!noteCard);
  if (noteCard) {
    const r = core.answer({ cardId: noteCard.card_id, rating: 4, elapsedMs: 2000 });
    check("词卡 answer 仍写 evidence_log",
      !!r.due_ms && db.prepare(
        "SELECT COUNT(*) n FROM evidence_log WHERE card_id=? AND source_type='review'").get(noteCard.card_id).n === 1);
  }
}

console.log(`\nasset-service: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
