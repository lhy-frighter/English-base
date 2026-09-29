const fs = require("fs");
const fp = "core.cjs";
let s = fs.readFileSync(fp, "utf8");
let n = 0;
// 1) start 返回题目时剥掉 answer/pi（不能把答案下发给客户端）
{
  const anchor = `      title: builtin.title, questions: form.questions, coverage: cov,`;
  if (s.includes(anchor)) {
    s = s.replace(anchor, `      title: builtin.title,
      questions: form.questions.map(({ q, options }) => ({ q, options })),
      coverage: cov,`);
    n++;
  }
}
// 2) finish 防重复提交
{
  const anchor = `  assessmentFinish(input) {
    const { form_id, active_ms, lookups, translated_paras, answers } = input || {};
    const bank = this._assessmentBank();
    const form = bank.forms.find((f) => f.id === form_id);
    if (!form) throw new Error("未知测评卷");`;
  const good = `  assessmentFinish(input) {
    const { form_id, active_ms, lookups, translated_paras, answers } = input || {};
    const bank = this._assessmentBank();
    const form = bank.forms.find((f) => f.id === form_id);
    if (!form) throw new Error("未知测评卷");
    if (this._usedAssessments().has(form.id)) throw new Error("该测评卷已提交，不能重复计分");`;
  if (s.includes(anchor)) { s = s.replace(anchor, good); n++; }
}
if (!n) { console.log("already"); process.exit(0); }
fs.writeFileSync(fp, s, "utf8");
console.log("core hardened, edits:", n);
