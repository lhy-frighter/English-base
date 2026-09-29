const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(cp, "utf8");
if (s.indexOf("debriefPut(") !== -1) { console.log("core already"); }
else {
  const anchor = `    return { evidence_id: Number(this.user.prepare('SELECT last_insert_rowid() AS id').get().id), replayed: false };
  }
`;
  if (s.indexOf(anchor) === -1) throw new Error("core anchor missing");
  const add = anchor + `
  // —— S13-a-2 会话复盘草稿（持久化、可恢复） ——
  debriefPut(o) {
    const originKind = String(o.origin_kind || '');
    if (!['reading','conversation','shadow','exam'].includes(originKind)) throw new Error('origin_kind 非法');
    const originRef = String(o.origin_ref || '');
    if (!originRef) throw new Error('origin_ref 不能为空');
    let candidatesJson = '[]';
    if (Array.isArray(o.candidates)) {
      try { candidatesJson = JSON.stringify(o.candidates); }
      catch { throw new Error('candidates 不可序列化'); }
    }
    const now = nowMs();
    const draftKey = originKind + ':' + originRef;
    this.user.prepare(\`INSERT INTO debrief_drafts
      (draft_key,origin_kind,origin_ref,candidates_json,status,created_at,updated_at)
      VALUES(?,?,?,?, 'open',?,?)
      ON CONFLICT(draft_key) DO UPDATE SET
        candidates_json=excluded.candidates_json,
        status=CASE WHEN debrief_drafts.status='open' THEN 'open' ELSE debrief_drafts.status END,
        updated_at=excluded.updated_at\`)
      .run(draftKey, originKind, originRef, candidatesJson, now, now);
    return { draft_key: draftKey };
  }

  debriefList() {
    return this.user.prepare(
      "SELECT * FROM debrief_drafts WHERE status='open' ORDER BY updated_at DESC").all();
  }

  debriefGet(draftKey) {
    return this.user.prepare("SELECT * FROM debrief_drafts WHERE draft_key=?").get(draftKey);
  }

  debriefSetStatus(draftKey, status) {
    if (!['open','done','skipped'].includes(status)) throw new Error('status 非法');
    const now = nowMs();
    this.user.prepare("UPDATE debrief_drafts SET status=?, updated_at=? WHERE draft_key=?")
      .run(status, now, draftKey);
    return this.debriefGet(draftKey);
  }

  // 本文复盘候选：查过、但本文尚未建卡（notes）的词，带词典释义
  textDebriefCandidates(textId) {
    const rows = this.user.prepare(\`SELECT DISTINCT word FROM lookup_log
      WHERE text_id=? ORDER BY id DESC\`).all(textId);
    const out = [];
    const seen = new Set();
    for (const r of rows) {
      const w = String(r.word || '').trim();
      if (!w || seen.has(w.toLowerCase())) continue;
      seen.add(w.toLowerCase());
      const low = w.toLowerCase();
      let lem = this.lemmaOf.get(low);
      if (!lem) { try { lem = this.ruleLemma(low); } catch { lem = null; } }
      const base = lem || low;
      const note = this.user.prepare(\`SELECT 1 FROM notes n JOIN lexemes x ON x.id=n.lexeme_id
        WHERE n.text_id=? AND lower(x.lemma) IN (?,?)\`).get(textId, low, base);
      if (note) continue;
      const drow = this.user.prepare(
        "SELECT translation FROM dict.words WHERE word=? AND translation<>''").get(base);
      const gloss = drow ? String(drow.translation).split("\\n")[0].trim() : "";
      out.push({ kind: 'word', canonical: base, clicked: w, gloss });
    }
    return out;
  }

  // 来源反向视图：本文已学词 / 各类资产 / 跟读通过句
  textLearnedSummary(textId) {
    const words = this.user.prepare(
      "SELECT COUNT(DISTINCT lexeme_id) n FROM notes WHERE text_id=?").get(textId).n;
    const assetRows = this.user.prepare(\`SELECT a.asset_kind AS kind, COUNT(DISTINCT a.id) n
      FROM asset_encounters e JOIN learning_assets a ON a.id=e.asset_id
      WHERE e.origin_kind='reading' AND e.origin_ref=? AND e.source_status='active'
      GROUP BY a.asset_kind\`).all(String(textId));
    const assets = {};
    for (const r of assetRows) assets[r.kind] = r.n;
    const shadowPass = this.user.prepare(
      "SELECT COUNT(*) n FROM shadow_sentences WHERE text_id=? AND status='active' AND COALESCE(best_similarity,0)>=80")
      .get(textId).n;
    return { words, assets, shadow_pass: shadowPass };
  }

  // 对话反向视图：本场沉淀资产（相遇）与用出证据分类计数
  conversationSummary(sessionKey) {
    const turns = this.user.prepare(
      "SELECT turn_key FROM conversation_turns WHERE session_key=? AND role='user'").all(sessionKey);
    const turnKeys = turns.map((t) => t.turn_key);
    let assets = 0; const assetKinds = {};
    const ev = { used_spontaneously: 0, used_prompted: 0, used_after_correction: 0, recognized: 0 };
    if (turnKeys.length) {
      const ph = '?,'.repeat(turnKeys.length).slice(0, -1);
      const aRows = this.user.prepare(\`SELECT a.asset_kind AS kind, COUNT(DISTINCT a.id) n
        FROM asset_encounters e JOIN learning_assets a ON a.id=e.asset_id
        WHERE e.origin_kind='conversation' AND e.origin_ref IN (\${ph})
        GROUP BY a.asset_kind\`).all(...turnKeys);
      for (const r of aRows) { assets += r.n; assetKinds[r.kind] = r.n; }
      const eRows = this.user.prepare(\`SELECT result, COUNT(*) n FROM asset_evidence
        WHERE source_kind='conversation' AND source_ref IN (\${ph}) AND result IN
        ('used_spontaneously','used_prompted','used_after_correction','recognized')
        GROUP BY result\`).all(...turnKeys);
      for (const r of eRows) ev[r.result] = r.n;
    }
    return { assets, assetKinds, evidence: ev };
  }
`;
  s = s.replace(anchor, add);
  fs.writeFileSync(cp, s);
  console.log("core.cjs patched");
}

// ---------- main.cjs IPC ----------
const mp = "D:/vibe coding/英语学习/app-electron/main.cjs";
let m = fs.readFileSync(mp, "utf8");
const mAnchor = "      addAssetEvidence: (p) => core.addAssetEvidence(p),\n";
if (m.indexOf(mAnchor) === -1) throw new Error("main anchor missing");
if (m.indexOf("debriefPut:") === -1) {
  m = m.replace(mAnchor, mAnchor +
    "      debriefPut: (p) => core.debriefPut(p),\n" +
    "      debriefList: () => core.debriefList(),\n" +
    "      debriefGet: (draftKey) => core.debriefGet(draftKey),\n" +
    "      debriefSetStatus: ({ draftKey, status }) => core.debriefSetStatus(draftKey, status),\n" +
    "      textDebriefCandidates: ({ textId }) => core.textDebriefCandidates(textId),\n" +
    "      textLearnedSummary: ({ textId }) => core.textLearnedSummary(textId),\n" +
    "      conversationSummary: ({ sessionKey }) => core.conversationSummary(sessionKey),\n");
  fs.writeFileSync(mp, m);
  console.log("main.cjs patched");
} else console.log("main already");

// ---------- preload.cjs ----------
const pp = "D:/vibe coding/英语学习/app-electron/preload.cjs";
let p = fs.readFileSync(pp, "utf8");
const pAnchor = "  addAssetEvidence: (inp) => call(\"addAssetEvidence\", inp),\n";
if (p.indexOf(pAnchor) === -1) throw new Error("preload anchor missing");
if (p.indexOf("debriefPut:") === -1) {
  p = p.replace(pAnchor, pAnchor +
    "  debriefPut: (inp) => call(\"debriefPut\", inp),\n" +
    "  debriefList: () => call(\"debriefList\"),\n" +
    "  debriefGet: (draftKey) => call(\"debriefGet\", { draftKey }),\n" +
    "  debriefSetStatus: (draftKey, status) => call(\"debriefSetStatus\", { draftKey, status }),\n" +
    "  textDebriefCandidates: (textId) => call(\"textDebriefCandidates\", { textId }),\n" +
    "  textLearnedSummary: (textId) => call(\"textLearnedSummary\", { textId }),\n" +
    "  conversationSummary: (sessionKey) => call(\"conversationSummary\", { sessionKey }),\n");
  fs.writeFileSync(pp, p);
  console.log("preload.cjs patched");
} else console.log("preload already");
