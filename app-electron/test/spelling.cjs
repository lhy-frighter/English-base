// spelling 听音拼写卡回归：建卡、getDue 正面听音/答案=单词、无选项、证据维度 spelling、FSRS 推进、backfill 幂等。
// 运行：node test/spelling.cjs
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Core } = require("../core.cjs");

let pass = 0, fail = 0;
function check(name, cond, extra) { console.log((cond ? "PASS" : "FAIL"), name, extra ?? ""); cond ? pass++ : fail++; }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spelling-"));
const core = new Core(dir);
const W = "abandon";
check("前置：测试词在词典", !!core.user.prepare("SELECT 1 AS x FROM dict.words WHERE word=?").get(W));

// 1) 词表收录含 spelling
const made = core.createStandaloneNote({ word: W, sense: "" });
const cards = core.user.prepare("SELECT id, card_type FROM cards WHERE note_id=? ORDER BY id").all(made.note_id);
const spId = cards.find((c) => c.card_type === "spelling")?.id;
check("词表收录生成 spelling 卡", !!spId, JSON.stringify(cards.map((c) => c.card_type)));

// 2) 把兄弟卡都推走，让 spelling 作为新卡进入队列（兄弟卡互埋，一次只出一张）
for (const c of cards) if (c.id !== spId) core.answer({ cardId: c.id, rating: 3, elapsedMs: 800 });
const due = core.getDue(10);
const sp = due.find((c) => c.card_type === "spelling");
check("spelling 进入复习队列", !!sp);
check("正面=听音拼写占位、答案=单词", sp?.sentence === "听音拼写" && sp?.answer === W && sp?.word === W, JSON.stringify(sp && { s: sp.sentence, a: sp.answer }));
check("spelling 无四选一选项（靠键入）", !sp?.choices, String(sp?.choices));

// 3) answer 证据落 spelling 维度
core.answer({ cardId: sp.card_id, rating: 2, elapsedMs: 1100 });
const ev = core.user.prepare("SELECT dimension FROM evidence_log WHERE card_id=? ORDER BY id DESC LIMIT 1").get(spId);
check("spelling 证据落 spelling 维度", ev?.dimension === "spelling", ev?.dimension);

// 4) FSRS 推进
const after = core.user.prepare("SELECT state, reps FROM cards WHERE id=?").get(spId);
check("spelling 评分后 reps+1 离开新卡", after.reps === 1 && after.state !== 0, JSON.stringify(after));

// 5) 阅读挖矿笔记也含 spelling（5 卡）
const now = Date.now();
core.user.prepare("INSERT INTO texts(title, raw_text, created_at) VALUES(?,?,?)").run("t", "Never abandon hope when things get hard. " + "y".repeat(20), now);
const textId = Number(core.user.prepare("SELECT last_insert_rowid() AS id").get().id);
const raw = core.user.prepare("SELECT raw_text FROM texts WHERE id=?").get(textId).raw_text;
const note2 = core.createNote({ word: W, sense: "", textId, offset: raw.indexOf("abandon") });
const types = core.user.prepare("SELECT card_type FROM cards WHERE note_id=? ORDER BY card_type").all(note2.note_id).map((r) => r.card_type);
check("阅读笔记 5 卡含 spelling", types.length === 5 && types.includes("spelling"), JSON.stringify(types));

// 6) backfill 幂等
core.backfillCards();
const b = core.user.prepare("SELECT COUNT(*) AS n FROM cards").get().n;
core.backfillCards();
const b2 = core.user.prepare("SELECT COUNT(*) AS n FROM cards").get().n;
check("backfill 重复不重复造卡", b === b2, `${b} vs ${b2}`);

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败 / spelling`);
process.exit(fail ? 1 : 0);
