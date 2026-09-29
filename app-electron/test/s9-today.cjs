// S9-3 今日页 todayBrief 调度规则回归
// 运行：node test/s9-today.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s9-today-"));
const core = new Core(dir);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

// 1. 空库：无卡无断点 → 好文
let b = core.todayBrief();
check("空库 primary=feed", b.primary === "feed", JSON.stringify(b));
check("空库队列为 0、无断点、无错题", b.queue === 0 && b.resume === null && b.wrong_due === 0 && b.est_minutes === 0);

// 2. 导入文章（不建卡）+ 断点 → 继续精读
const raw = "Researchers investigate complex phenomena every day. The methods require careful planning and analysis.";
const saved = core.annotateAndSave(raw, "测试文章");
core.saveResumeState("reading", saved.text_id, { pi: 0, ch: 14 }, "h");
b = core.todayBrief();
check("有断点无卡 primary=reading", b.primary === "reading", JSON.stringify({ p: b.primary, q: b.queue }));
check("resume 带标题与段落", !!b.resume && b.resume.title === "测试文章" && b.resume.refId === String(saved.text_id) && b.resume.pi === 0);

// 3. 阅读中查词建卡（5 张新卡 state=0）→ 今日新卡余额 12，队列 >0 → 复习优先
const off = raw.indexOf("investigate");
const made = core.createNote({ word: "investigate", label: "word", phrase: "", sense: "", textId: saved.text_id, offset: off });
check("建卡成功 5 张", made.cards_created === 5, JSON.stringify(made));
b = core.todayBrief();
check("有卡后 primary=review", b.primary === "review", JSON.stringify({ p: b.primary, due: b.due_cards, fresh: b.fresh_today }));
check("队列=到期+实际可学新卡（受新卡总数约束），预估分钟=ceil(队列*0.5)且≥1",
  b.queue === b.due_cards + b.fresh_today && b.fresh_today === 5 && b.est_minutes === Math.max(1, Math.round(b.queue * 0.5)),
  JSON.stringify({ q: b.queue, est: b.est_minutes }));

// 4. 删除断点文章后 resume 被级联清除（无卡场景由其他链覆盖，这里直接验行）
core.deleteText(saved.text_id);
b = core.todayBrief();
check("删文后 resume 为空", b.resume === null);

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
