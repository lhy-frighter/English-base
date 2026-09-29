const fs = require("fs");

// ---------- 1. core.cjs：加两个 Core 方法 ----------
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(cp, "utf8");
const anchor = `    return { card_id: Number(this.user.prepare('SELECT last_insert_rowid() AS id').get().id), created: true };
  }
`;
if (s.indexOf(anchor) === -1) throw new Error("core anchor missing");
if (s.indexOf("findAssetByCanonical(") === -1) {
  const methods = anchor + `
  // 按 canonical 查已有资产（发音重录链：判断是否可写 practice_observation/improved）
  findAssetByCanonical(kind, canonical) {
    if (!['word','chunk','grammar','pronunciation','concept'].includes(kind)) throw new Error('asset_kind 非法');
    const norm = normalizeExpression(canonical);
    if (!norm) return null;
    const rows = this.user.prepare('SELECT id, canonical FROM learning_assets WHERE asset_kind=?').all(kind);
    const hit = rows.find((r) => normalizeExpression(r.canonical) === norm);
    return hit ? Number(hit.id) : null;
  }

  // 追加一条能力证据（practice_observation/improved/used_* 等）；幂等键冲突回传 replayed
  addAssetEvidence(input) {
    const assetId = Number(input.asset_id);
    const ALLOWED = ['correct','partial','wrong','practice_observation','improved','recurred',
      'recognized','used_spontaneously','used_prompted','used_after_correction'];
    const result = String(input.result || '');
    if (!ALLOWED.includes(result)) throw new Error('result 非法');
    const a = this.user.prepare('SELECT id FROM learning_assets WHERE id=?').get(assetId);
    if (!a) throw new Error('资产不存在');
    const sourceKind = String(input.source_kind || '');
    if (!['reading','conversation','shadow','exam','syllabus','review'].includes(sourceKind))
      throw new Error('source_kind 非法');
    const dimension = String(input.dimension || '').slice(0, 100);
    if (!dimension) throw new Error('dimension 不能为空');
    const idem = String(input.idempotency_key || '').trim();
    if (!idem) throw new Error('idempotency_key 不能为空');
    let payloadJson = '{}';
    if (input.payload) {
      try { payloadJson = JSON.stringify(input.payload); }
      catch { throw new Error('payload 不可序列化'); }
    }
    const prior = this.user.prepare('SELECT id FROM asset_evidence WHERE idempotency_key=?').get(idem);
    if (prior) return { evidence_id: prior.id, replayed: true };
    const now = nowMs();
    this.user.prepare(\`INSERT INTO asset_evidence
      (asset_id,dimension,result,source_kind,source_ref,payload_json,occurred_at,idempotency_key)
      VALUES(?,?,?,?,?,?,?,?)\`)
      .run(assetId, dimension, result, sourceKind, String(input.source_ref || ''),
        payloadJson, now, idem);
    return { evidence_id: Number(this.user.prepare('SELECT last_insert_rowid() AS id').get().id), replayed: false };
  }
`;
  s = s.replace(anchor, methods);
  fs.writeFileSync(cp, s);
  console.log("core.cjs patched");
} else console.log("core.cjs already");

// ---------- 2. main.cjs IPC ----------
const mp = "D:/vibe coding/英语学习/app-electron/main.cjs";
let m = fs.readFileSync(mp, "utf8");
const mAnchor = "      addPronProductionCard: ({ assetId }) => core.addPronProductionCard(assetId),\n";
if (m.indexOf(mAnchor) === -1) throw new Error("main anchor missing");
if (m.indexOf("findAssetByCanonical:") === -1) {
  m = m.replace(mAnchor, mAnchor +
    "      findAssetByCanonical: ({ kind, canonical }) => core.findAssetByCanonical(kind, canonical),\n" +
    "      addAssetEvidence: (p) => core.addAssetEvidence(p),\n");
  fs.writeFileSync(mp, m);
  console.log("main.cjs patched");
} else console.log("main.cjs already");

// ---------- 3. preload.cjs ----------
const pp = "D:/vibe coding/英语学习/app-electron/preload.cjs";
let p = fs.readFileSync(pp, "utf8");
const pAnchor = "  addPronProductionCard: (assetId) => call(\"addPronProductionCard\", { assetId }),\n";
if (p.indexOf(pAnchor) === -1) throw new Error("preload anchor missing");
if (p.indexOf("findAssetByCanonical:") === -1) {
  p = p.replace(pAnchor, pAnchor +
    "  findAssetByCanonical: (kind, canonical) => call(\"findAssetByCanonical\", { kind, canonical }),\n" +
    "  addAssetEvidence: (inp) => call(\"addAssetEvidence\", inp),\n");
  fs.writeFileSync(pp, p);
  console.log("preload.cjs patched");
} else console.log("preload.cjs already");
