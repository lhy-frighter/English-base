// 文章删除回归：级联清理笔记/卡片/复习记录/证据/查词日志；共享词元在最后一条笔记删除后才清理
// 运行：node test/delete-text.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delete-text-"));
const core = new Core(dir);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

const textA = "The benefit of exercise is enormous for every student here.";
const textB = "Another benefit appeared in the second paragraph of the report.";
const a = core.annotateAndSave(textA, "A");
const b = core.annotateAndSave(textB, "B");
core.createNote({ word: "benefit", label: "word", phrase: null, sense: "n. 利益", textId: a.text_id, offset: textA.indexOf("benefit") });
core.createNote({ word: "benefit", label: "word", phrase: null, sense: "n. 利益", textId: b.text_id, offset: textB.indexOf("benefit") });
const lexId = core.user.prepare("SELECT id FROM lexemes WHERE lemma='benefit'").get().id;
check("两篇文章各建一条笔记", core.user.prepare("SELECT COUNT(*) n FROM notes WHERE lexeme_id=?").get(lexId).n === 2);
const cardsBefore = core.user.prepare("SELECT COUNT(*) n FROM cards c JOIN notes n ON c.note_id=n.id WHERE n.lexeme_id=?").get(lexId).n;
// 每篇 6 张（5 张词级 + 1 张句子翻译 note_translate，#205）
check("两篇共 12 张卡（每篇 6 张）", cardsBefore === 12, cardsBefore);
check("其中翻译卡 2 张", core.user.prepare(
  "SELECT COUNT(*) n FROM cards c JOIN notes n ON c.note_id=n.id WHERE n.lexeme_id=? AND c.card_type='note_translate'"
).get(lexId).n === 2);

const r1 = core.deleteText(a.text_id);
check("删 A 返回删除成功且 1 条笔记", r1.deleted === true && r1.notes === 1, JSON.stringify(r1));
check("A 笔记已删、B 笔记保留",
  core.user.prepare("SELECT COUNT(*) n FROM notes WHERE text_id=?").get(a.text_id).n === 0 &&
  core.user.prepare("SELECT COUNT(*) n FROM notes WHERE text_id=?").get(b.text_id).n === 1);
check("共享词元 benefit 仍保留（B 还在用）", !!core.user.prepare("SELECT 1 x FROM lexemes WHERE id=?").get(lexId));
check("A 的卡片已随笔记级联删除", core.user.prepare("SELECT COUNT(*) n FROM cards c JOIN notes n ON c.note_id=n.id WHERE n.text_id=?").get(a.text_id).n === 0);
check("内存 learned 仍含 benefit", core.learned.has("benefit"));
check("A 的查词/重现证据已清", core.user.prepare("SELECT COUNT(*) n FROM evidence_log WHERE source_ref=?").get(String(a.text_id)).n === 0);

const r2 = core.deleteText(b.text_id);
check("删 B 后词元成为孤儿被清理（lexemesRemoved≥1）", r2.lexemesRemoved >= 1, JSON.stringify(r2));
check("benefit 词元已不存在", !core.user.prepare("SELECT 1 x FROM lexemes WHERE lemma='benefit'").get());
check("内存 learned 同步移除", !core.learned.has("benefit"));
check("文章行已删", !core.getText(b.text_id));

const r3 = core.deleteText(b.text_id);
check("重复删除幂等（deleted:false）", r3.deleted === false, JSON.stringify(r3));

// 概念词元不被文章删除连带清理
const c = core.annotateAndSave("A third text about a concept word like analysis.", "C");
core.user.prepare("INSERT INTO lexemes(lemma,pos,sense,tag,bnc,frq,created_at) VALUES('__test_concept__','__concept__','','',0,0,?)").run(Date.now());
const cid = core.user.prepare("SELECT id FROM lexemes WHERE lemma='__test_concept__'").get().id;
core.user.prepare("INSERT INTO notes(lexeme_id,text_id,context_sentence,source,created_at) VALUES(?,?,?,'concept',?)").run(cid, c.text_id, "概念", Date.now());
core.deleteText(c.text_id);
check("概念词元不被孤儿清理", !!core.user.prepare("SELECT 1 x FROM lexemes WHERE id=?").get(cid));
core.user.prepare("DELETE FROM lexemes WHERE id=?").run(cid);

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
