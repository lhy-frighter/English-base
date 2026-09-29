// S11-c 跟读句 1/3/7 轻量复习：调度推进 / 提前练不推进 / 出师 / 忽略 / 计数 / todayBrief / shadow resume scope
// 运行：node test/s11-shadow-review.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s11-shadow-"));
const core = new Core(dir);
const db = core.user;
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}
const DAY = 86400000;
const setDuePast = (hash) => db.prepare("UPDATE shadow_sentences SET due_at=? WHERE sentence_hash=?").run(Date.now() - 1000, hash);

// 0. migration v12
check("user_version=15", db.prepare("PRAGMA user_version").get().user_version === 15);

// 1. 首次练完：stage=0，约 1 天后到期，进入 due（未到期不计）
const S1 = "Attention mechanisms have become an integral part of compelling sequence modeling.";
const r1 = core.shadowPractice({ sentence: `  ${S1}  `, similarity: 82, textId: null, title: "" });
check("首次练习 isNew/stage0/active", r1.isNew && r1.stage === 0 && r1.status === "active");
check("首次 due≈1 天后", Math.abs(r1.dueAt - (Date.now() + DAY)) < 5000, String(r1.dueAt - Date.now()));
check("未到期 shadowDueCount=0", core.shadowDueCount() === 0);
check("best_similarity 落库 82", db.prepare("SELECT best_similarity b FROM shadow_sentences WHERE sentence_hash=?").get(r1.hash).b === 82);

// 2. 空白句拒绝
let threw = false;
try { core.shadowPractice({ sentence: "   " }); } catch { threw = true; }
check("空句拒绝", threw);

// 3. 到期前重复练：不推进 stage，due 不变
const dueBefore = db.prepare("SELECT due_at d FROM shadow_sentences WHERE sentence_hash=?").get(r1.hash).d;
const rEarly = core.shadowPractice({ sentence: S1, similarity: 90 });
const dueAfter = db.prepare("SELECT due_at d, stage s, practice_count c, best_similarity b FROM shadow_sentences WHERE sentence_hash=?").get(r1.hash);
check("提前练不推进 stage", !rEarly.advanced && dueAfter.s === 0 && dueAfter.d === dueBefore);
check("练习次数+1、best 取最大", dueAfter.c === 2 && dueAfter.b === 90);

// 4. 到期后再练：0→1（3 天）；1→2（7 天）；2→出师
setDuePast(r1.hash);
const r2 = core.shadowPractice({ sentence: S1, similarity: 91 });
check("到期推进 0→1 advanced", r2.advanced && r2.stage === 1 && !r2.graduated);
check("stage1 due≈3 天", Math.abs(r2.dueAt - (Date.now() + 3 * DAY)) < 5000);
check("推进后未到下一期 dueCount=0", core.shadowDueCount() === 0);
setDuePast(r1.hash);
const r3 = core.shadowPractice({ sentence: S1, similarity: 91 });
check("到期推进 1→2", r3.advanced && r3.stage === 2);
check("stage2 due≈7 天", Math.abs(r3.dueAt - (Date.now() + 7 * DAY)) < 5000);
setDuePast(r1.hash);
const r4 = core.shadowPractice({ sentence: S1, similarity: 95 });
check("到期推进 2→出师 graduated", r4.graduated && r4.stage === 3 && r4.status === "graduated" && r4.dueAt === 0);
check("出师句不再进 due", core.shadowDueCount() === 0);
// 出师后再练：状态保持
const r5 = core.shadowPractice({ sentence: S1, similarity: 99 });
check("出师后再练不复活", !r5.advanced && r5.status === "graduated");

// 5. 同句不同空白/大小写归一为同一条
const rCase = core.shadowPractice({ sentence: S1.toUpperCase() + "\n" });
check("大小写/空白归一命中同一条", !rCase.isNew);

// 6. 多句 due 排序与 dismiss
const A = "The first review sentence is short.";
const B = "The second review sentence appears later.";
const ra = core.shadowPractice({ sentence: A, similarity: 70 });
const rb = core.shadowPractice({ sentence: B, similarity: 70, title: "外刊一篇" });
setDuePast(ra.hash);
new Promise((res) => setTimeout(res, 5)); // due_at 同毫秒时按插入顺序；强制 B 晚 10ms
const rowB = db.prepare("SELECT id FROM shadow_sentences WHERE sentence_hash=?").get(rb.hash);
db.prepare("UPDATE shadow_sentences SET due_at=? WHERE id=?").run(Date.now() + 10, rowB.id);
const due = core.shadowDue(20);
check("due 只含到期 active 句（A 在，B/出师句不在）",
  due.length === 1 && due[0].sentence === A, JSON.stringify(due.map((d) => d.sentence)));
check("due 带逾期毫秒与来源标题", due[0].overdueMs > 0);
check("todayBrief.shadow_due 同步", core.todayBrief().shadow_due === 1);
check("dismiss 生效且从 due 移除", core.shadowDismiss(due[0].id) === true && core.shadowDueCount() === 0);
check("重复 dismiss 返回 false", core.shadowDismiss(due[0].id) === false);

// 7. 来源标题/文章 id 回填：首个来源标题保留，textId 为空时补填
const t = core.annotateAndSave("Some body text for the shadow source article.", "来源文章 X");
const rSrc = core.shadowPractice({ sentence: B, textId: t.text_id, title: "来源文章 X", similarity: 88 });
const row = db.prepare("SELECT text_id tid, source_title tt FROM shadow_sentences WHERE sentence_hash=?").get(rSrc.hash);
check("textId 回填、首个来源标题保留", row.tid === t.text_id && row.tt === "外刊一篇", JSON.stringify(row));

// 8. shadow scope resume 可用
const saved = core.saveResumeState("shadow", "shadow", { sentence: B });
const got = core.getResumeState("shadow");
check("shadow resume 存取", saved && got.locator.sentence === B);
core.saveResumeState("shadow", "shadow", { sentence: A });
check("shadow resume 每 scope 仅一行", db.prepare("SELECT COUNT(*) n FROM resume_state WHERE scope='shadow'").get().n === 1
  && core.getResumeState("shadow").locator.sentence === A);

// 9. similarity 越界裁剪
const rClip = core.shadowPractice({ sentence: "Another sentence for clipping similarity.", similarity: 250 });
check("similarity 裁剪到 100",
  db.prepare("SELECT best_similarity b FROM shadow_sentences WHERE sentence_hash=?").get(rClip.hash).b === 100);

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败 / s11-shadow-review`);
process.exit(fail ? 1 : 0);
