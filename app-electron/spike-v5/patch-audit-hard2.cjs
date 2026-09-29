// 审计修复-8：ruleLemma 增加 -ly 副词还原（frq 门控照旧）；setWrongReason 事务化；answer rating 校验
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

// 1) -ly 副词还原（adversarially→adversarial；本词在词典中时不会走到这里）
rep(
`    if (/ier$/.test(w0)) add(w0.slice(0, -3) + "y");                                               // happier→happy`,
`    if (w0.length > 4 && /ly$/.test(w0)) add(w0.slice(0, -2));                                    // adversarially→adversarial
    if (/ier$/.test(w0)) add(w0.slice(0, -3) + "y");                                               // happier→happy`,
"ruleLemma -ly");

// 2) answer rating 入参校验
rep(
`  answer({ cardId, rating, elapsedMs }) {
    const now = nowMs();`,
`  answer({ cardId, rating, elapsedMs }) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 4) throw new Error("rating 必须为 1-4");
    const now = nowMs();`,
"answer rating 校验");

// 3) setWrongReason 概念卡创建事务化（避免 lexeme/note/card 半写）
rep(
`    const now = nowMs();
    this.user.prepare(\`INSERT INTO lexemes(lemma, pos, sense, tag, bnc, frq, created_at) VALUES(?,?,?,'',0,0,?)\`)
      .run(lemma, "__concept__", front, now);
    const lexId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
    this.user.prepare("INSERT INTO notes(lexeme_id, text_id, context_sentence, source, created_at) VALUES(?,NULL,?,'concept',?)")
      .run(lexId, back, now);
    const noteId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
    this.user.prepare(\`INSERT INTO cards(note_id, card_type, due, state, stability, difficulty, reps, lapses, last_review, created_at)
      VALUES(?,'concept',?,0,NULL,NULL,0,0,NULL,?)\`).run(noteId, now + 60_000, now);
    const cardId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
    this.user.prepare("UPDATE wrong_questions SET concept_card_id=? WHERE id=?").run(cardId, id);
    return { concept_card_id: cardId };`,
`    const now = nowMs();
    const tx = this.user.prepare("BEGIN IMMEDIATE");
    try {
      tx.run();
      this.user.prepare(\`INSERT INTO lexemes(lemma, pos, sense, tag, bnc, frq, created_at) VALUES(?,?,?,'',0,0,?)\`)
        .run(lemma, "__concept__", front, now);
      const lexId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
      this.user.prepare("INSERT INTO notes(lexeme_id, text_id, context_sentence, source, created_at) VALUES(?,NULL,?,'concept',?)")
        .run(lexId, back, now);
      const noteId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
      this.user.prepare(\`INSERT INTO cards(note_id, card_type, due, state, stability, difficulty, reps, lapses, last_review, created_at)
        VALUES(?,'concept',?,0,NULL,NULL,0,0,NULL,?)\`).run(noteId, now + 60_000, now);
      const cardId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
      this.user.prepare("UPDATE wrong_questions SET concept_card_id=? WHERE id=?").run(cardId, id);
      this.user.prepare("COMMIT").run();
      return { concept_card_id: cardId };
    } catch (e) {
      try { this.user.prepare("ROLLBACK").run(); } catch { /* 已回滚 */ }
      throw e;
    }`,
"setWrongReason 事务");

fs.writeFileSync(fp, s, "utf8");
console.log("saved");
