// S10-1 仪表盘聚合回归：互斥分钟、次数不折分钟、日界/连胜、不可变覆盖率、墓碑
// 运行：node test/s10-insights.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s10-insights-"));
const core = new Core(dir);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}
function rejects(name, fn) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  check(name, threw);
}
const DAY = 86400000;
const todayStart = core.dayStart();
const keyAt = (offsetDays) => core.dayKey(todayStart + offsetDays * DAY);
const todayKey = core.dayKey();

// 1. 空库
let ins = core.insights(30);
check("空库连胜 0", ins.streak.current === 0 && ins.streak.longest === 0);
check("空库总分钟全 0", Object.values(ins.totals.minutes).every((m) => m === 0));
check("空库今日 timeline 无效", core.dayTimeline(todayKey).valid === false);
rejects("非法 dateKey 被拒", () => core.dayTimeline("2026-9-21"));

// 2. 导入文章 → 不可变覆盖率快照
const raw = "Researchers investigate complex methods every day. The methods require careful planning, analysis, and evidence.";
const saved = core.annotateAndSave(raw, "测试文章");
ins = core.insights(30);
check("首篇文章产生 first_annotate 覆盖率快照", ins.coverage.length === 1 && ins.coverage[0].kind === "first_annotate"
  && ins.coverage[0].rate >= 0 && ins.coverage[0].rate <= 1, JSON.stringify(ins.coverage));

// 3. 两个词挖矿 → 10 张新卡，全部评分（每张 60s）
core.createNote({ word: "investigate", label: "word", phrase: "", sense: "", textId: saved.text_id, offset: raw.indexOf("investigate") });
core.createNote({ word: "evidence", label: "word", phrase: "", sense: "", textId: saved.text_id, offset: raw.indexOf("evidence") });
const cardIds = core.user.prepare("SELECT id FROM cards ORDER BY id").all().map((r) => r.id);
check("生成 12 张卡（2 篇 × 6）", cardIds.length === 12, String(cardIds.length));
for (const id of cardIds) core.answer({ cardId: id, rating: 3, elapsedMs: 60000 });

// 4. 今日 read 会话：400 词、4 分钟
const rd = core.beginSession({ kind: "read", refType: "text", refId: String(saved.text_id), titleSnapshot: "测试文章", amount: 400, unit: "words" });
core.closeSession(rd.sessionKey, { amount: 400, activeMs: 240000 });
// 5. 今日 shadow 会话：3 句、2 分钟
const sh = core.beginSession({ kind: "shadow", refType: "shadow_sentence", refId: "s1", titleSnapshot: "跟读句", amount: 3, unit: "sentences" });
core.closeSession(sh.sessionKey, { amount: 3, activeMs: 120000 });
// 开放会话不计入
const openS = core.beginSession({ kind: "read", refType: "text", refId: "999", amount: 9999, unit: "words" });

// 6. 动作次数：查词/翻译（notes 已由挖矿产生 2 条）
core.user.prepare("INSERT INTO lookup_log(word,text_id,created_at) VALUES(?,?,?)").run("complex", saved.text_id, Date.now());
core.user.prepare(`INSERT INTO text_translations(text_id,para_index,source_sha256,translated_text,pairs_json,status,updated_at)
  VALUES(?,?,?,?, '[]','ok',?)`).run(saved.text_id, 0, "h", "译文", Date.now());

// 7. 考试：1 套卷、10 分钟前台活跃
core.user.prepare(`INSERT INTO papers(title,kind,raw_md,norm_text,struct_json,n_questions,created_at)
  VALUES('cet6','cet6','x','norm-x','{"questions":[]}',0,?)`).run(todayStart);
const paperId = core.user.prepare("SELECT last_insert_rowid() AS id").get().id;
core.user.prepare("INSERT INTO attempts(paper_id,answers_json,result_json,started_at,finished_at,active_ms) VALUES(?,?,?,?,?,?)")
  .run(paperId, "{}", "{}", todayStart + 3600000, todayStart + 4200000, 600000);

ins = core.insights(30);
const t = ins.totals;
// 12 张卡（2 篇 × 6）→ 复习 12 次 12 分钟
check("今日复习 12 卡、12 分钟", t.reviews === 12 && t.minutes.review === 12, JSON.stringify({ r: t.reviews, m: t.minutes.review }));
check("阅读 400 词 4 分钟", t.readWords === 400 && t.minutes.read === 4, JSON.stringify({ w: t.readWords, m: t.minutes.read }));
check("跟读 3 句 2 分钟", t.shadowSentences === 3 && t.minutes.shadow === 2);
check("考试 1 套 10 分钟（active_ms 口径）", t.examPapers === 1 && t.minutes.exam === 10);
check("查词/成卡/翻译只计次数：2 笔记 1 查词 1 翻译", t.counts.note === 2 && t.counts.lookup === 1 && t.counts.translation === 1,
  JSON.stringify(t.counts));
check("总分钟=四主流之和，次数不折分钟",
  t.minutes.read + t.minutes.shadow + t.minutes.review + t.minutes.exam === 4 + 2 + 12 + 10,
  JSON.stringify(t.minutes));
check("开放会话不计入（readWords 仍 400）", t.readWords === 400);
const today = ins.days[ins.days.length - 1];
check("今日为有效学习日（四条规则任一）", today.valid === true);

// 8. 跨天与连胜：昨天、前天各 10 条复习（每条 60s）；5 天前 10 条（与连续段有缺口）
for (const off of [-1, -2, -5]) {
  const ts = todayStart + off * DAY + 3600000;
  for (let i = 0; i < 10; i++) {
    core.user.prepare("INSERT INTO review_log(card_id,rated_at,rating,last_ivl,ivl,elapsed_ms) VALUES(?,?,3,0,1,?)")
      .run(cardIds[0], ts, 60000);
  }
}
ins = core.insights(30);
check("当前连胜 3（今天+昨天+前天）", ins.streak.current === 3, JSON.stringify(ins.streak));
check("最长连胜 3（5 天前孤点不连）", ins.streak.longest === 3, JSON.stringify(ins.streak));
// 今日 12 次 + 昨天/前天/5天前各 10 次 = 42
check("区间复习总分钟=42（今日 12 + 三天各 10）", ins.totals.minutes.review === 42, String(ins.totals.minutes.review));
const yKey = keyAt(-1);
check("日下钻：昨天有效且含复习汇总条", (() => {
  const tl = core.dayTimeline(yKey);
  const rv = tl.entries.find((e) => e.kind === "review");
  return tl.valid && rv && rv.amount === 10 && rv.minutes === 10;
})(), JSON.stringify(core.dayTimeline(yKey).entries.map((e) => e.kind)));

// 9. 墓碑：另一篇文章的阅读会话，删文后会话保留且标 deleted
const raw2 = "Another standalone article about geology and weather patterns for tombstone tests.";
const saved2 = core.annotateAndSave(raw2, "将删除文章");
const rd2 = core.beginSession({ kind: "read", refType: "text", refId: String(saved2.text_id), titleSnapshot: "将删除文章", amount: 350, unit: "words" });
core.closeSession(rd2.sessionKey, { amount: 350, activeMs: 200000 });
core.deleteText(saved2.text_id);
const tlToday = core.dayTimeline(todayKey);
const tomb = tlToday.entries.find((e) => e.kind === "read" && e.refId === String(saved2.text_id));
check("删文后会话保留为墓碑", !!tomb && tomb.deleted === true, JSON.stringify(tomb));
ins = core.insights(30);
check("覆盖率快照不因删文消失", ins.coverage.some((c) => c.textId === saved2.text_id && c.deleted === true));

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
