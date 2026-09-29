// S12 平行文本能力测评测试链
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Core } = require("../core.cjs");

let pass = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("  ok:", name); }
  else { console.error("FAIL:", name, extra !== undefined ? extra : ""); process.exit(1); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s12-"));
const core = new Core(tmp);
const bank = require("../data/assessment-bank.json");

// 1) 蓝图
const bps = core.assessmentBlueprints();
check("两个测评蓝图", bps.length === 2, bps.length);
for (const bp of bps) {
  check(`蓝图 ${bp.id} 初始 3 卷`, bp.forms_left === 3 && bp.forms_total === 3, bp.forms_left);
}

// 2) B2 开卷
const st = core.assessmentStart("b2-general");
check("开卷返回 form/cefr/title", !!st.form_id && st.cefr === "B2" && !!st.title, st);
check("4 道题", st.questions.length === 4, st.questions.length);
check("题目选项 4 个", st.questions.every((q) => q.options.length === 4));
check("答案不下发客户端", st.questions.every((q) => q.answer === undefined && q.pi === undefined));
check("覆盖率字段", st.coverage.total > 200 && st.coverage.rate > 0 && st.coverage.rate <= 1, st.coverage);
check("builtin_id 返回", typeof st.builtin_id === "string" && st.builtin_id.length > 0);

// 3) 满分交卷（按题库答案构造）
const formDef = bank.forms.find((f) => f.id === st.form_id);
const correctAnswers = formDef.questions.map((q) => q.answer);
// 目标 wpm≈80
const activeMs = Math.round((st.coverage.total / 80) * 60000);
const r = core.assessmentFinish({
  form_id: st.form_id, active_ms: activeMs, lookups: 2, translated_paras: 1,
  answers: correctAnswers,
});
check("返回总分 0-100", r.score >= 0 && r.score <= 100, r.score);
check("理解题满分", r.comp === 100 && r.correct === 4, r.comp);
check("速度分合理（wpm≈80）", r.wpm >= 70 && r.wpm <= 90 && r.speed >= 70, r);
check("依赖分按查词/机翻扣减", r.dependence === 100 - 12 - 10, r.dependence);
check("快照含全部组件", r.coverage > 0 && r.formula.includes("0.45"));

// 4) 落库
const rows = core.user.prepare("SELECT * FROM coverage_assessments WHERE kind='parallel_test'").all();
check("parallel_test 落库 1 行", rows.length === 1, rows.length);
check("快照 JSON 合法", (() => { try { JSON.parse(rows[0].snapshot_json); return true; } catch { return false; } })());
check("rate=score/100", Math.abs(rows[0].rate - r.score / 100) < 1e-9, rows[0].rate);
check("text_id 为空（平行卷不进书库）", rows[0].text_id === null || rows[0].text_id === undefined);

// 5) 历史
const hist = core.assessmentHistory();
check("历史 1 条、字段齐全", hist.length === 1 && hist[0].score === r.score && hist[0].cefr === "B2");

// 6) 防重复提交
let threw = false;
try { core.assessmentFinish({ form_id: st.form_id, active_ms: activeMs, answers: correctAnswers }); }
catch { threw = true; }
check("同一卷重复交被拒", threw);

// 7) 防练习效应：B2 再开两次耗尽
const usedForms = new Set([st.form_id]);
const st2 = core.assessmentStart("b2-general");
check("第二卷不同于第一卷", !!st2.form_id && !usedForms.has(st2.form_id));
usedForms.add(st2.form_id);
core.assessmentFinish({ form_id: st2.form_id, active_ms: activeMs, answers: bank.forms.find((f) => f.id === st2.form_id).questions.map((q) => q.answer) });
const st3 = core.assessmentStart("b2-general");
check("第三卷", st3.form_id && !usedForms.has(st3.form_id));
core.assessmentFinish({ form_id: st3.form_id, active_ms: activeMs, answers: bank.forms.find((f) => f.id === st3.form_id).questions.map((q) => q.answer) });
threw = false;
try { core.assessmentStart("b2-general"); } catch { threw = true; }
check("B2 卷耗尽后诚实报错", threw);
const bpsAfter = core.assessmentBlueprints();
check("B2 剩余 0 卷", bpsAfter.find((b) => b.id === "b2-general").forms_left === 0);

// 8) C1 蓝图不受影响
const c1 = core.assessmentStart("c1-academic");
check("C1 开卷正常", c1.cefr === "C1" && c1.questions.length === 4);

// 9) 未知蓝图
threw = false;
try { core.assessmentStart("nope"); } catch { threw = true; }
check("未知蓝图报错", threw);

// 10) 零阅读时间：速度 0、不崩溃
const r0 = core.assessmentFinish({
  form_id: c1.form_id, active_ms: 0, lookups: 0, translated_paras: 0,
  answers: bank.forms.find((f) => f.id === c1.form_id).questions.map(() => -1),
});
check("零计时交卷不崩溃、wpm=0、理解 0 分", r0.wpm === 0 && r0.comp === 0, r0);

core.user.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} 通过 / 0 失败 / s12-assessment`);
