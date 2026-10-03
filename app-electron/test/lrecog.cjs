// l_recog 听音辨义卡回归：建卡数量、getDue 四选一、answer 证据维度分流、backfill 幂等。
// 运行：node test/lrecog.cjs
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Core } = require("../core.cjs");

let pass = 0, fail = 0;
function check(name, cond, extra) { console.log((cond ? "PASS" : "FAIL"), name, extra ?? ""); cond ? pass++ : fail++; }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lrecog-"));
const core = new Core(dir);

// 选一个词典里确实有翻译的常见词
const W = "abandon";
const dictRow = core.user.prepare("SELECT translation FROM dict.words WHERE word=? AND translation<>''").get(W);
check("前置：测试词在词典且有翻译", !!dictRow, W);

// 1) 词表收录生成 recall + l_recog + spelling 三张卡
const made = core.createStandaloneNote({ word: W, sense: "" });
check("词表收录生成 3 卡（recall+l_recog+spelling）", made.cards_created === 3, JSON.stringify(made));
const cards = core.user.prepare("SELECT id, card_type FROM cards WHERE note_id=? ORDER BY id").all(made.note_id);
const types = cards.map((c) => c.card_type).sort();
check("卡型集合=[l_recog,recall,spelling]", JSON.stringify(types) === JSON.stringify(["l_recog", "recall", "spelling"]), JSON.stringify(types));
const recallId = cards.find((c) => c.card_type === "recall").id;
const lrecogId = cards.find((c) => c.card_type === "l_recog").id;

// 2) 兄弟卡互埋：先把 recall 评分推到未来，l_recog 才作为新卡进入队列
core.answer({ cardId: recallId, rating: 3, elapsedMs: 1000 });
const due = core.getDue(10);
const lc = due.find((c) => c.card_type === "l_recog");
check("l_recog 进入复习队列", !!lc);
check("l_recog 正面为听音占位、背面=单词", lc.sentence === "听音选义" && lc.answer === W && lc.word === W);
check("l_recog 给 4 个释义选项", Array.isArray(lc.choices) && lc.choices.length === 4, String(lc.choices?.length));
const correctMeaning = (lc.sense || dictRow.translation.split("\\n")[0].trim());
check("正确释义在选项中", lc.choices.includes(correctMeaning), correctMeaning);

// 3) answer 证据维度按卡型分流
core.answer({ cardId: lc.card_id, rating: 2, elapsedMs: 1200 });
const evL = core.user.prepare("SELECT dimension FROM evidence_log WHERE card_id=? ORDER BY id DESC LIMIT 1").get(lrecogId);
const evR = core.user.prepare("SELECT dimension FROM evidence_log WHERE card_id=? ORDER BY id DESC LIMIT 1").get(recallId);
check("l_recog 证据落 listening_recognition", evL?.dimension === "listening_recognition", evL?.dimension);
check("recall 证据落 meaning_recall", evR?.dimension === "meaning_recall", evR?.dimension);

// 4) l_recog 评分后 FSRS 正常推进（state 离开新卡 0、有 stability）
const after = core.user.prepare("SELECT state, stability, reps FROM cards WHERE id=?").get(lrecogId);
check("l_recog 评分后 reps+1 且进入调度", after.reps === 1 && after.state !== 0, JSON.stringify(after));

// 5) backfillCards 幂等：首次会给 standalone 补 r_recog/cloze（既有设计），再跑一次数量不变
core.backfillCards();
const before = core.user.prepare("SELECT COUNT(*) AS n FROM cards").get().n;
core.backfillCards();
const afterN = core.user.prepare("SELECT COUNT(*) AS n FROM cards").get().n;
check("backfill 重复运行不重复造卡", before === afterN, `${before} vs ${afterN}`);

// 6) 阅读挖矿笔记生成 5 卡（r_recog/cloze/recall/l_recog/spelling）——用 SQL 直接造一篇文本再走 createNote
const now = Date.now();
core.user.prepare("INSERT INTO texts(title, raw_text, created_at) VALUES(?,?,?)").run("t", "We should never abandon our friends in difficulty. " + "x".repeat(20), now);
const textId = Number(core.user.prepare("SELECT last_insert_rowid() AS id").get().id);
const raw = core.user.prepare("SELECT raw_text FROM texts WHERE id=?").get(textId).raw_text;
const off = raw.indexOf("abandon");
const note2 = core.createNote({ word: W, sense: "", textId, offset: off });
const t2 = core.user.prepare("SELECT card_type FROM cards WHERE note_id=? ORDER BY card_type").all(note2.note_id).map((r) => r.card_type);
check("阅读笔记生成 6 卡含 l_recog/spelling/翻译卡", t2.length === 6 && t2.includes("l_recog") && t2.includes("spelling"), JSON.stringify(t2));

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败 / lrecog`);
process.exit(fail ? 1 : 0);
