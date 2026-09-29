// S9-3 修正：fresh 队列必须受实际 state=0 新卡数量约束，空库不能推荐复习
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const oldStr = `    const c = this.counts();
    const queue = c.due_review + c.new_remaining_today;
    const estMinutes = queue > 0 ? Math.max(1, Math.round(queue * 0.5)) : 0;`;
const newStr = `    const c = this.counts();
    // 新卡实际可学数 = min(今日新卡余额, 库中 state=0 新卡总数)，空库不算队列
    const freshCards = this.user.prepare("SELECT COUNT(*) AS n FROM cards WHERE state=0").get().n;
    const fresh = Math.min(c.new_remaining_today, freshCards);
    const queue = c.due_review + fresh;
    const estMinutes = queue > 0 ? Math.max(1, Math.round(queue * 0.5)) : 0;`;
if (!s.includes(oldStr)) throw new Error("锚点缺失");
s = s.replace(oldStr, newStr);
s = s.replace(`      due_cards: c.due_review,
      fresh_today: c.new_remaining_today,
      queue,`,
`      due_cards: c.due_review,
      fresh_today: fresh,
      queue,`);
fs.writeFileSync(fp, s, "utf8");
console.log("patched");
