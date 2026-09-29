// 跟读问题词成卡 + 硬化回归：成卡/来源分层/去重/非空 sense 合并/先校验后写/事务零残留/迁移可重入。
// 运行：node test/shadow-note.cjs
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Core } = require("../core.cjs");

let pass = 0, fail = 0;
function check(name, cond, extra) { console.log((cond ? "PASS" : "FAIL"), name, extra ?? ""); cond ? pass++ : fail++; }
const count = (core, sql) => core.user.prepare(sql).get().n;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-note-"));
const core = new Core(dir);
const W = "abandon";
const SENT = "Never abandon a good plan under pressure.";
check("前置：user_version=15（迁移到最新）", core.user.prepare("PRAGMA user_version").get().user_version === 15);

// 1) 跟读问题词成卡：5 卡、source=shadow、带真实语境句、新建词元用词典默认释义（非空 sense，避免 recall 退化）
const made = core.createShadowNote({ word: W, sentence: SENT });
const noteRow = core.user.prepare("SELECT source, text_id, context_sentence FROM notes WHERE id=?").get(made.note_id);
const lexRow = core.user.prepare("SELECT sense FROM lexemes WHERE id=?").get(made.lexeme_id);
const types = core.user.prepare("SELECT card_type FROM cards WHERE note_id=? ORDER BY card_type").all(made.note_id).map((r) => r.card_type);
check("跟读笔记 source=shadow", noteRow.source === "shadow", noteRow.source);
check("跟读笔记 text_id 为空（自由文本）", noteRow.text_id == null);
check("跟读笔记带真实语境句", noteRow.context_sentence === SENT);
check("新建词元 sense 非空（词典默认释义）", !!lexRow.sense.trim(), JSON.stringify(lexRow.sense));
check("跟读问题词生成全套 5 卡", made.cards_created === 5 && types.length === 5 && ["r_recog", "cloze", "recall", "l_recog", "spelling"].every((t) => types.includes(t)), JSON.stringify(types));

// 2) 同词+同语境句去重
const again = core.createShadowNote({ word: W, sentence: SENT });
check("同词同句重复确认→already 且不新建", again.already && again.cards_created === 0 && again.note_id === made.note_id);

// 3) 同词不同句→并行新笔记
const other = core.createShadowNote({ word: W, sentence: "They had to abandon the car in the snow." });
check("同词不同句→并行新笔记", !other.already && other.note_id !== made.note_id);

// 4) P0-3：空句/未收录在校验阶段拒绝，词库与 learned 零变化
const before = {
  lex: count(core, "SELECT COUNT(*) n FROM lexemes"), notes: count(core, "SELECT COUNT(*) n FROM notes"),
  cards: count(core, "SELECT COUNT(*) n FROM cards"),
};
let threwEmpty = false, threwBad = false;
try { core.createShadowNote({ word: W, sentence: "  " }); } catch { threwEmpty = true; }
try { core.createShadowNote({ word: "zzqxnotaword", sentence: SENT }); } catch { threwBad = true; }
check("空句抛错", threwEmpty);
check("未收录词抛错", threwBad);
check("校验失败不写任何词元/笔记/卡",
  count(core, "SELECT COUNT(*) n FROM lexemes") === before.lex &&
  count(core, "SELECT COUNT(*) n FROM notes") === before.notes &&
  count(core, "SELECT COUNT(*) n FROM cards") === before.cards);
check("校验失败不污染 learned", !core.learned.has("zzqxnotaword"));

// 5) P0-2：真实考纲路径用非空 sense 建词元，跟读必须复用同一词元（merged），不造空 sense 分身
const W2 = "benefit";
const SENSE = "n. 利益；好处";
const stand = core.createStandaloneNote({ word: W2, sense: SENSE });
check("考纲收录笔记 source=syllabus", core.user.prepare("SELECT source FROM notes WHERE id=?").get(stand.note_id).source === "syllabus");
const lexBefore = core.user.prepare("SELECT COUNT(*) n FROM lexemes WHERE lemma=?").get(W2).n;
const merged = core.createShadowNote({ word: W2, sentence: "Good sleep will benefit your memory." });
const lexAfter = core.user.prepare("SELECT COUNT(*) n FROM lexemes WHERE lemma=?").get(W2).n;
check("跟读复用考纲词元（不新建分身）", merged.lexeme_id === stand.lexeme_id && lexBefore === 1 && lexAfter === 1, `before=${lexBefore} after=${lexAfter}`);
check("复用合并 merged=true 且 5 卡", merged.merged === true && merged.cards_created === 5, JSON.stringify(merged));

// 6) P0-3：事务保护——在第 3 张卡插入时注入失败，断言词元/笔记/卡与 learned 全部回滚零残留
const W3 = "improve";
const pre = {
  lex: count(core, "SELECT COUNT(*) n FROM lexemes"), notes: count(core, "SELECT COUNT(*) n FROM notes"),
  cards: count(core, "SELECT COUNT(*) n FROM cards"),
};
const origPrepare = core.user.prepare.bind(core.user);
let cardInserts = 0, injected = false;
core.user.prepare = (sql, ...rest) => {
  if (sql.includes("INSERT INTO cards")) { cardInserts++; if (cardInserts === 3) { injected = true; throw new Error("injected failure"); } }
  return origPrepare(sql, ...rest);
};
let txThrew = false;
try { core.createShadowNote({ word: W3, sentence: "You can improve a little every single day." }); } catch { txThrew = true; }
core.user.prepare = origPrepare;
check("故障被抛出且确实注入", txThrew && injected);
check("事务回滚：词元/笔记/卡零增长",
  count(core, "SELECT COUNT(*) n FROM lexemes") === pre.lex &&
  count(core, "SELECT COUNT(*) n FROM notes") === pre.notes &&
  count(core, "SELECT COUNT(*) n FROM cards") === pre.cards);
check("事务回滚：learned 不含该词", !core.learned.has(W3));
// 回滚后同一请求可正常重试成功
const retry = core.createShadowNote({ word: W3, sentence: "You can improve a little every single day." });
check("回滚后重试成功成 5 卡", !retry.already && retry.cards_created === 5, JSON.stringify(retry));

// 7) 跟读卡能进复习队列且带跟读语境句
const allCards = core.user.prepare("SELECT id, card_type FROM cards WHERE note_id=? ORDER BY id").all(made.note_id);
const rrecog = allCards.find((c) => c.card_type === "r_recog");
for (const c of allCards) if (c.id !== rrecog.id) core.answer({ cardId: c.id, rating: 3, elapsedMs: 800 });
const got = core.getDue(10).find((c) => c.note_id === made.note_id);
check("跟读卡进入复习队列且带语境句", !!got && got.sentence === SENT, JSON.stringify(got && { t: got.card_type, s: got.sentence }));

// 8) 阅读挖矿 source=reading 不受影响
const now = Date.now();
core.user.prepare("INSERT INTO texts(title, raw_text, created_at) VALUES(?,?,?)").run("t", "We will not abandon the project now. " + "x".repeat(20), now);
const textId = Number(core.user.prepare("SELECT last_insert_rowid() AS id").get().id);
const raw = core.user.prepare("SELECT raw_text FROM texts WHERE id=?").get(textId).raw_text;
// 用与跟读一致的默认释义 sense，阅读笔记才会挂到同一词元（不同 sense 在设计上本就是不同词元）
const sameSense = core.user.prepare("SELECT translation FROM dict.words WHERE word=?").get(W).translation.split("\\n")[0].trim();
const rn = core.createNote({ word: W, sense: sameSense, textId, offset: raw.indexOf("abandon") });
check("阅读挖矿笔记 source=reading", core.user.prepare("SELECT source FROM notes WHERE id=?").get(rn.note_id).source === "reading");

// 9) lexemeDetail 带来源分层
const det = core.lexemeDetail(made.lexeme_id);
const srcs = det.notes.map((n) => n.source);
check("lexemeDetail 带出每条笔记来源", srcs.filter((s) => s === "shadow").length === 2 && srcs.includes("reading"), JSON.stringify(srcs));

// 10) P1：v7 迁移可重入——模拟"source 列已加、版本仍停在 6"的中断窗口，重启不得 duplicate column 崩溃
const notesBeforeReentry = count(core, "SELECT COUNT(*) n FROM notes");
core.user.close();
const half = new Core(dir);
half.user.exec("PRAGMA user_version=6"); // 人为退回版本，但 source 列已存在
half.user.close();
let reentryErr = null;
let recovered;
try { recovered = new Core(dir); } catch (e) { reentryErr = e; }
check("半迁移重入不抛 duplicate column", !reentryErr && recovered, String(reentryErr));
check("重入后版本正确回到最新（15）", recovered && recovered.user.prepare("PRAGMA user_version").get().user_version === 15);
check("重入数据无损", recovered && count(recovered, "SELECT COUNT(*) n FROM notes") === notesBeforeReentry);
recovered.user.close();

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败 / shadow-note`);
process.exit(fail ? 1 : 0);

