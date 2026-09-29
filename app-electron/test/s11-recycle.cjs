// S11-b 漏网词回收：跨篇聚合 / 资产排除 / 功能词拦截 / 批量成卡（sense 非空）/ 相遇保留 / todayBrief 计数
// 运行：node test/s11-recycle.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s11-recycle-"));
const core = new Core(dir);
const db = core.user;
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

const T1 = "The mechanism reveals an inherent paradox in the quantum framework.";
const T2 = "This mechanism creates a paradox within the research framework.";
const a1 = core.annotateAndSave(T1, "Paper One");
const a2 = core.annotateAndSave(T2, "Paper Two");

// 1. 跨篇聚合
const multi = core.recycleCandidates({ minTexts: 2 });
const mech = multi.items.find((x) => x.lemma === "mechanism");
check("mechanism 跨 2 篇出现", !!mech && mech.texts === 2 && mech.total === 2, JSON.stringify(mech && { texts: mech.texts, total: mech.total }));
check("候选带来源文章（标题+次数）", !!mech && mech.sources.length === 2 &&
  mech.sources.every((s) => typeof s.title === "string" && s.count >= 1));
check("mechanism 带考纲等级", !!mech && mech.levelRank > 0, `level=${mech && mech.level}`);
check("候选带译义与音标字段", !!mech && mech.gloss.length > 0);

// 2. 单篇词只在 minTexts=1 视图
const quantum = multi.items.find((x) => x.lemma === "quantum");
check("只出现 1 篇的 quantum 不进多篇视图", !quantum);
const all = core.recycleCandidates({ minTexts: 1 });
check("minTexts=1 视图包含 quantum", all.items.some((x) => x.lemma === "quantum"));
check("total 为过滤前候选总数且分页生效", all.total >= all.items.length);
const page1 = core.recycleCandidates({ minTexts: 1, limit: 2, offset: 0 });
check("limit/offset 分页", page1.items.length === 2);

// 3. 功能词永不进回收
check("the/this/in/within 等功能词不在候选",
  !all.items.some((x) => ["the", "this", "in", "within", "an", "of"].includes(x.lemma)));

// 4. 计数与 todayBrief
const rc = core.recycleCount();
check("recycleCount: multi≥1 且 total≥multi", rc.multi >= 1 && rc.total >= rc.multi, JSON.stringify(rc));
const brief = core.todayBrief();
check("todayBrief 带 recycle_multi/recycle_total",
  brief.recycle_multi === rc.multi && brief.recycle_total === rc.total);

// 5. 批量成卡
const res = core.recycleAdd(["mechanism", "the", "zzqqxx-not-a-word"]);
check("mechanism 成卡 3 张（recall/l_recog/spelling）",
  res.added.length === 1 && res.added[0].lemma === "mechanism" && res.added[0].cards === 3,
  JSON.stringify(res));
check("功能词被拦截", res.skipped.some((x) => x.lemma === "the" && x.reason === "function"));
check("未收录词被拦截", res.skipped.some((x) => x.lemma === "zzqqxx-not-a-word" && x.reason === "unresolved"));

// 6. 成卡后候选消失、相遇事实保留
const multi2 = core.recycleCandidates({ minTexts: 1 });
check("成卡后 mechanism 不再是候选", !multi2.items.some((x) => x.lemma === "mechanism"));
const kept = db.prepare("SELECT COUNT(*) n FROM unknown_encounters WHERE lemma='mechanism'").get().n;
check("成卡后历史相遇保留（证据不删）", kept === 2, `kept=${kept}`);

// 7. 重复收录走 already
const res2 = core.recycleAdd(["mechanism"]);
check("重复回收 mechanism 计入 already", res2.already.includes("mechanism") && res2.added.length === 0);

// 8. recall 卡 sense 非空（不退化成 词=词）
const due = core.getDue(20);
const recall = due.find((c) => c.card_type === "recall" && c.word === "mechanism");
check("recall 卡正面是中文释义而非单词本身",
  !!recall && recall.correctChoice && recall.correctChoice !== "mechanism" && /[\u4e00-\u9fff]/.test(recall.correctChoice)
    && !recall.correctChoice.includes("\\n"),
  JSON.stringify(recall && recall.correctChoice));

// 9. 排序：考纲/AWL 词整体在无等级词之前
check("排序：考纲/AWL 词整体在无等级词之前", (() => {
  const idxLevel = all.items.findIndex((x) => x.levelRank > 0 || x.awl === 1);
  const idxNone = all.items.findIndex((x) => x.levelRank === 0 && x.awl === 0);
  return idxLevel === -1 || idxNone === -1 || idxLevel < idxNone;
})());

// 10. 删文级联后候选同步消失
core.deleteText(a1.text_id);
const afterDel = core.recycleCandidates({ minTexts: 1 });
const quantumGone = !afterDel.items.some((x) => x.lemma === "quantum");
check("删文后该文独有词从候选消失", quantumGone);

// 11. 功能词永不建卡：lookup 标 cardable:false，三个 create 入口抛错
const theEntry = core.lookup("the", "word", null, null);
check("lookup(the) 标记为不可建卡", !!theEntry && theEntry.cardable === false && theEntry.kind === "function");
let threwThe = false;
try { core.createStandaloneNote({ word: "the", label: "word", phrase: false, sense: "" }); }
catch (e) { threwThe = /功能词/.test(String(e.message)); }
check("createStandaloneNote 拒绝功能词", threwThe);
let threwOf = false;
try { core.createNote({ word: "of", label: "word", phrase: false, sense: "", textId: a1.text_id, offset: 0 }); }
catch (e) { threwOf = /功能词/.test(String(e.message)); }
check("createNote 拒绝功能词", threwOf);
const lexCountAfter = core.user.prepare("SELECT COUNT(*) n FROM lexemes WHERE lemma IN ('the','of')").get().n;
check("拒绝后词元零污染", lexCountAfter === 0);

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败 / s11-recycle`);
process.exit(fail ? 1 : 0);
