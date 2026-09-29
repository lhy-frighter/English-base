const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(cp, "utf8");
if (s.indexOf("assetPriority(") !== -1) { console.log("already"); process.exit(0); }

const anchor = "  // S13-b-2 资产用出次数（卡背展示）";
if (s.indexOf(anchor) === -1) throw new Error("anchor missing");

const add = `  // S13-c priority 有界加性分（algo v1）
  assetPriority(assetId, nowMs) {
    const now = nowMs || Date.now();
    const a = this.user.prepare("SELECT * FROM learning_assets WHERE id=?").get(assetId);
    if (!a) throw new Error("资产不存在");
    const parts = {
      overdue: 0, recurrence: 0, recent_error: 0,
      exam: 0, output_gap: 0, success_decay: 0,
    };
    const reasons = [];

    const cards = this.user.prepare("SELECT due FROM cards WHERE asset_id=?").all(assetId);
    let maxDays = 0;
    for (const c of cards) {
      if (c.due < now) {
        const d = (now - c.due) / 86400000;
        if (d > maxDays) maxDays = d;
      }
    }
    parts.overdue = maxDays <= 0 ? 0 : maxDays < 1 ? 1 : maxDays < 3 ? 2 : 3;
    if (parts.overdue) reasons.push("复习已逾期 " + (maxDays < 1 ? "<1" : maxDays.toFixed(1)) + " 天");

    const recN = this.user.prepare(
      "SELECT COUNT(*) n FROM asset_evidence WHERE asset_id=? AND result='recurred'").get(assetId).n;
    parts.recurrence = Math.min(3, recN);
    if (parts.recurrence) reasons.push("问题复发 " + recN + " 次");

    const since7 = now - 7 * 86400000;
    const errs = this.user.prepare(
      "SELECT result FROM asset_evidence WHERE asset_id=? AND occurred_at>=? AND result IN ('wrong','partial')")
      .all(assetId, since7);
    parts.recent_error = Math.min(2, errs.length);
    if (parts.recent_error) reasons.push("近 7 天有错误记录");

    if (a.asset_kind === "word" && a.lexeme_id) {
      const lx = this.user.prepare("SELECT lemma FROM lexemes WHERE id=?").get(a.lexeme_id);
      if (lx) {
        const w = this.user.prepare("SELECT tag FROM dict.words WHERE word=?")
          .get(lx.lemma.toLowerCase());
        if (w && w.tag && /(cet6|ky|ielts|toefl|gre)/.test(w.tag)) {
          parts.exam = 1; reasons.push("考纲词汇");
        }
      }
    }

    const usedN = this.user.prepare(
      "SELECT COUNT(*) n FROM asset_evidence WHERE asset_id=? AND result IN ('used_spontaneously','used_prompted','used_after_correction')")
      .get(assetId).n;
    const recognizedN = this.user.prepare(
      "SELECT COUNT(*) n FROM asset_evidence WHERE asset_id=? AND result IN ('recognized','correct','improved')")
      .get(assetId).n;
    if (usedN === 0 && recognizedN > 0) { parts.output_gap = 1; reasons.push("只会认不会用"); }

    const succN = this.user.prepare(
      "SELECT COUNT(*) n FROM asset_evidence WHERE asset_id=? AND occurred_at>=? AND result IN ('correct','improved','used_spontaneously')")
      .get(assetId, since7).n;
    parts.success_decay = Math.min(2, succN);

    const score = parts.overdue + parts.recurrence + parts.recent_error +
      parts.exam + parts.output_gap - parts.success_decay;
    return {
      asset_id: assetId, score: Math.max(0, score),
      parts, reasons, algo: "priority-v1",
    };
  }

  priorityList({ limit = 5, kinds } = {}) {
    const kf = (kinds && kinds.length)
      ? kinds : ["word", "chunk", "grammar", "pronunciation", "concept"];
    const ph = "(" + kf.map(() => "?").join(",") + ")";
    const rows = this.user.prepare(
      "SELECT id FROM learning_assets WHERE status='active' AND asset_kind IN " + ph)
      .all(...kf);
    const out = rows.map((r) => this.assetPriority(r.id)).filter((p) => p.score > 0);
    out.sort((x, y) => (y.score - x.score) || (y.asset_id - x.asset_id));
    return out.slice(0, limit);
  }

` + anchor;
s = s.slice(0, s.indexOf(anchor)) + add + s.slice(s.indexOf(anchor));
fs.writeFileSync(cp, s);
console.log("core patched");
