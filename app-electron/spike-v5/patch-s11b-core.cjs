// S11-b：漏网词回收 core API（recycleCandidates/recycleCount/recycleAdd）+ todayBrief 挂计数
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

const methods = `
  // —— S11-b 漏网词回收 ——
  // 跨篇聚合 unknown_encounters 中"仍无词元资产"的词（成卡后历史相遇保留，但候选自动消失）
  _recycleAggregate() {
    const rows = this.user.prepare(
      \`SELECT u.lemma, SUM(u.count) AS total, COUNT(DISTINCT u.text_id) AS texts,
              MIN(u.first_seen_at) AS first_seen, MAX(u.last_seen_at) AS last_seen
       FROM unknown_encounters u
       WHERE NOT EXISTS (SELECT 1 FROM lexemes l WHERE l.lemma=u.lemma AND l.pos<>'__concept__')
       GROUP BY u.lemma\`
    ).all();
    const srcStmt = this.user.prepare(
      \`SELECT u.text_id AS text_id, t.title AS title, u.count AS count
       FROM unknown_encounters u JOIN texts t ON t.id=u.text_id
       WHERE u.lemma=? ORDER BY u.count DESC, u.last_seen_at DESC LIMIT 3\`
    );
    const out = [];
    for (const row of rows) {
      if (this.isFunctionLemma(row.lemma)) continue; // 双保险：功能词永不进回收
      const alias = this.words.get(row.lemma);
      const d = alias ? this.lookupWordRow(alias, row.lemma) : null;
      if (!d) continue; // 写入口保证 cardable，查不到只可能是词包被卸载
      const tags = String(d.tag || "").split(/\\s+/).filter(Boolean);
      let levelRank = 0;
      let level = "";
      for (let i = 0; i < LEVEL_LADDER.length; i++) {
        if (tags.includes(LEVEL_LADDER[i])) { levelRank = i + 1; level = LEVEL_LADDER[i]; }
      }
      const gloss = (d.translation || "").split("\\\\n")[0].trim();
      out.push({
        lemma: row.lemma, phonetic: d.phonetic || "", gloss,
        tag: d.tag || "", frq: Number(d.frq) || 0, level, levelRank,
        awl: AWL_BY_FORM.has(row.lemma) ? 1 : 0,
        texts: row.texts, total: row.total,
        firstSeen: row.first_seen, lastSeen: row.last_seen,
        sources: srcStmt.all(row.lemma),
      });
    }
    // 排序：考纲等级（gre>…>zk）→ AWL → 常用度（frq 排名小在前，零频垫底）→ 相遇篇数/次数
    out.sort((a, b) =>
      (b.levelRank - a.levelRank) ||
      (b.awl - a.awl) ||
      ((a.frq === 0 ? 1 : 0) - (b.frq === 0 ? 1 : 0)) ||
      (a.frq && b.frq ? a.frq - b.frq : 0) ||
      (b.texts - a.texts) ||
      (b.total - a.total));
    return out;
  }

  // opts: { minTexts=2, limit=50, offset=0 }
  recycleCandidates(opts = {}) {
    const minTexts = Math.max(1, Number(opts.minTexts) || 2);
    const limit = Math.max(1, Math.min(300, Number(opts.limit) || 50));
    const offset = Math.max(0, Number(opts.offset) || 0);
    const all = this._recycleAggregate().filter((x) => x.texts >= minTexts);
    return { total: all.length, items: all.slice(offset, offset + limit) };
  }

  recycleCount() {
    const all = this._recycleAggregate();
    return { total: all.length, multi: all.filter((x) => x.texts >= 2).length };
  }

  // 批量加入复习（走考纲收录同一条 createStandaloneNote：recall+l_recog+spelling 三卡；
  // sense 取词典首行译义，避免 recall 卡退化成"词=词"）
  recycleAdd(words) {
    if (!Array.isArray(words)) throw new Error("recycleAdd 需要词数组");
    const added = [], already = [], skipped = [];
    for (const w0 of words) {
      const lemma = String(w0 || "").toLowerCase().trim();
      if (!lemma) continue;
      if (this.isFunctionLemma(lemma)) { skipped.push({ lemma, reason: "function" }); continue; }
      const r = this.resolve(lemma, "word", false);
      if (!r) { skipped.push({ lemma, reason: "unresolved" }); continue; }
      const sense = (r.translation || "").split("\\\\n")[0].trim();
      const out = this.createStandaloneNote({ word: r.lemma, label: "word", phrase: false, sense });
      if (out.already) already.push(r.lemma);
      else added.push({ lemma: r.lemma, cards: out.cards_created });
    }
    return { added, already, skipped };
  }

`;
rep(
`  // 挂载领域词包：内置 data/packs/*.sqlite 优先，其次用户 dataDir/packs；同名文件只挂一次`,
methods + `  // 挂载领域词包：内置 data/packs/*.sqlite 优先，其次用户 dataDir/packs；同名文件只挂一次`,
"回收三方法");

// todayBrief 挂 recycle 计数
rep(
`    const wrongDue = this.wrongDueCount();
    let primary = "feed";
    if (queue > 0) primary = "review";
    else if (resume) primary = "reading";
    return {
      primary,
      due_cards: c.due_review,
      fresh_today: fresh,
      queue,
      est_minutes: estMinutes,
      resume,
      wrong_due: wrongDue,
    };`,
`    const wrongDue = this.wrongDueCount();
    const recycle = this.recycleCount();
    let primary = "feed";
    if (queue > 0) primary = "review";
    else if (resume) primary = "reading";
    return {
      primary,
      due_cards: c.due_review,
      fresh_today: fresh,
      queue,
      est_minutes: estMinutes,
      resume,
      wrong_due: wrongDue,
      recycle_multi: recycle.multi,
      recycle_total: recycle.total,
    };`,
"todayBrief 回收计数");

fs.writeFileSync(fp, s, "utf8");
console.log("saved");
