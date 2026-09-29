const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(cp, "utf8");
if (s.indexOf("detectUsedAssets(") !== -1) { console.log("core already"); }
else {
  // 插入在 conversationSummary 方法之后（找到该方法结尾 "  }\n\n  // 3." 风格不稳，改用 addPronProductionCard 之前的锚）
  const anchor = "  // 本文复盘候选：查过、但本文尚未建卡（notes）的词，带词典释义";
  if (s.indexOf(anchor) === -1) throw new Error("anchor missing");
  const add = `  // S13-b-1 用出证据检测：用户确认轮发送时匹配 word/chunk 资产，分类写证据
  detectUsedAssets({ sessionKey, turnKey, text }) {
    const out = [];
    const raw = String(text || "");
    if (!raw.trim()) return out;
    const cjk = (raw.match(/[\\u4e00-\\u9fff]/g) || []).length;
    const letters = (raw.match(/[A-Za-z]/g) || []).length;
    if (letters < 2 || cjk > letters) return out; // 中文轮/中英混说中文为主 → 不评估

    // 上一条 assistant 轮的纠错内容 → after_correction 判定
    let correctionText = "";
    const sess = this.user.prepare(
      "SELECT id FROM conversation_sessions WHERE session_key=?").get(sessionKey);
    if (sess) {
      const prev = this.user.prepare(
        "SELECT local_feedback_json,text FROM conversation_turns WHERE session_id=? AND role='assistant' ORDER BY seq DESC LIMIT 1").get(sess.id);
      if (prev) {
        try {
          const fb = JSON.parse(prev.local_feedback_json || "[]");
          if (Array.isArray(fb)) correctionText = fb.map((x) =>
            (x && (x.correction || x.suggestion || x.text || "")) || "").join(" ");
        } catch { correctionText = ""; }
        correctionText += " " + prev.text;
      }
    }
    const normCorrection = normalizeExpression(correctionText);

    const normRaw = normalizeExpression(raw);
    const tokens = raw.toLowerCase().match(/[a-z][a-z'’-]*/g) || [];
    const lemmas = new Set();
    for (const t of tokens) {
      lemmas.add(t);
      const l = this.lemmaOf.get(t);
      if (l) lemmas.add(l);
      else { try { const rl = this.ruleLemma(t); if (rl) lemmas.add(rl); } catch { /* */ } }
    }

    const classify = (asset, matchedVia, result) => {
      const tag = result === "used_spontaneously" ? "sp"
        : result === "used_prompted" ? "pr" : "ac";
      const idem = "used-" + tag + "-" + sessionKey + "-" + asset.id;
      try {
        const r = this.addAssetEvidence({
          asset_id: asset.id, dimension: asset.asset_kind + "_use",
          result, source_kind: "conversation", source_ref: turnKey,
          payload: { session_key: sessionKey }, idempotency_key: idem,
        });
        out.push({ asset_id: asset.id, result, replayed: r.replayed });
      } catch { /* 单条失败跳过 */ }
    };

    const wordAssets = this.user.prepare(
      "SELECT id,canonical FROM learning_assets WHERE asset_kind='word' AND status='active'").all();
    for (const a of wordAssets) {
      const canon = normalizeExpression(a.canonical);
      if (!canon || !lemmas.has(canon)) continue;
      const result = normCorrection && normCorrection.indexOf(canon) !== -1
        ? "used_after_correction" : "used_spontaneously";
      classify(a, canon, result);
    }
    const chunkAssets = this.user.prepare(
      "SELECT id,canonical,payload_json FROM learning_assets WHERE asset_kind='chunk' AND status='active'").all();
    for (const a of chunkAssets) {
      const variants = [a.canonical];
      try {
        const p = JSON.parse(a.payload_json || "{}");
        if (Array.isArray(p.variants)) variants.push(...p.variants);
      } catch { /* */ }
      let hit = null;
      for (const v of variants) {
        const nv = normalizeExpression(v);
        if (nv && normRaw.indexOf(nv) !== -1) { hit = nv; break; }
      }
      if (!hit) continue;
      const result = normCorrection && normCorrection.indexOf(hit) !== -1
        ? "used_after_correction" : "used_spontaneously";
      classify(a, hit, result);
    }
    return out;
  }

` + anchor;
  s = s.slice(0, s.indexOf(anchor)) + add + s.slice(s.indexOf(anchor));
  fs.writeFileSync(cp, s);
  console.log("core patched");
}

// main.cjs
{
  const mp = "D:/vibe coding/英语学习/app-electron/main.cjs";
  let m = fs.readFileSync(mp, "utf8");
  const a = "      conversationSummary: ({ sessionKey }) => core.conversationSummary(sessionKey),\n";
  if (m.indexOf(a) === -1) throw new Error("main anchor missing");
  if (m.indexOf("detectUsedAssets:") === -1) {
    m = m.replace(a, a + "      detectUsedAssets: (p) => core.detectUsedAssets(p),\n");
    fs.writeFileSync(mp, m); console.log("main patched");
  } else console.log("main already");
}

// preload.cjs
{
  const pp = "D:/vibe coding/英语学习/app-electron/preload.cjs";
  let p = fs.readFileSync(pp, "utf8");
  const a = '  conversationSummary: (sessionKey) => call("conversationSummary", { sessionKey }),\n';
  if (p.indexOf(a) === -1) throw new Error("preload anchor missing");
  if (p.indexOf("detectUsedAssets:") === -1) {
    p = p.replace(a, a + '  detectUsedAssets: (inp) => call("detectUsedAssets", inp),\n');
    fs.writeFileSync(pp, p); console.log("preload patched");
  } else console.log("preload already");
}
