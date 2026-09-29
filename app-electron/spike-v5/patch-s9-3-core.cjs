// S9-3 core：todayBrief() —— 今日页唯一数据源（固定调度规则 v1）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const anchor = `    return { due_review: dueReview, new_remaining_today: Math.max(0, NEW_PER_DAY - newToday), total_cards: totalCards, total_lexemes: totalLexemes };
  }`;
const insert = `
  // S9-3 今日页：固定调度 ①有到期/新卡→复习 ②无卡且有未读完文章→继续精读 ③都没有→今日好文
  // 每张卡预估 30 秒（认读为主），最少 1 分钟
  todayBrief() {
    const c = this.counts();
    const queue = c.due_review + c.new_remaining_today;
    const estMinutes = queue > 0 ? Math.max(1, Math.round(queue * 0.5)) : 0;
    let resume = null;
    const row = this.user.prepare("SELECT ref_id, locator_json FROM resume_state WHERE scope='reading'").get();
    if (row) {
      const t = this.user.prepare("SELECT title FROM texts WHERE id=?").get(Number(row.ref_id));
      if (t) {
        const loc = JSON.parse(this._sessionLocator(row.locator_json));
        resume = { refId: row.ref_id, title: t.title, pi: loc.pi, ch: loc.ch ?? 0 };
      }
    }
    const wrongDue = this.wrongDueCount();
    let primary = "feed";
    if (queue > 0) primary = "review";
    else if (resume) primary = "reading";
    return {
      primary,
      due_cards: c.due_review,
      fresh_today: c.new_remaining_today,
      queue,
      est_minutes: estMinutes,
      resume,
      wrong_due: wrongDue,
    };
  }`;
if (s.includes("todayBrief()")) { console.log("skip"); }
else {
  if (!s.includes(anchor)) throw new Error("锚点缺失");
  s = s.replace(anchor, anchor + "\n" + insert);
  fs.writeFileSync(fp, s, "utf8");
  console.log("patched core");
}
