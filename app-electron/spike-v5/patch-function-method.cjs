const fs = require("fs");
const fp = "core.cjs";
let s = fs.readFileSync(fp, "utf8");
if (s.includes("pruneFunctionLexemes() {")) { console.log("method already present"); process.exit(0); }
const anchor = `  // 一次性清理：旧版 unknown_encounters 里的功能词行（app_settings 记录幂等）`;
if (!s.includes(anchor)) { console.error("anchor missing"); process.exit(1); }
const method = `  // 一次性清理：存量功能词词元及其笔记/卡片/复习记录（功能词永不进 SRS）
  pruneFunctionLexemes() {
    if (this.user.prepare("SELECT 1 FROM app_settings WHERE k='func_lexemes_pruned'").get()) return;
    const lemmas = this.user.prepare("SELECT id, lemma FROM lexemes WHERE pos<>'__concept__'").all()
      .filter((r) => this.isFunctionLemma(r.lemma));
    if (!lemmas.length) {
      this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('func_lexemes_pruned','0')").run();
      return;
    }
    const ids = lemmas.map((r) => r.id);
    const ph = ids.map(() => "?").join(",");
    this.user.exec("BEGIN");
    try {
      this.user.prepare(
        \`DELETE FROM review_log WHERE card_id IN (SELECT c.id FROM cards c JOIN notes n ON n.id=c.note_id WHERE n.lexeme_id IN (\${ph}))\`
      ).run(...ids);
      this.user.prepare(
        \`DELETE FROM cards WHERE note_id IN (SELECT id FROM notes WHERE lexeme_id IN (\${ph}))\`
      ).run(...ids);
      this.user.prepare(\`DELETE FROM evidence_log WHERE lexeme_id IN (\${ph})\`).run(...ids);
      this.user.prepare(\`DELETE FROM notes WHERE lexeme_id IN (\${ph})\`).run(...ids);
      this.user.prepare(\`DELETE FROM lexemes WHERE id IN (\${ph})\`).run(...ids);
      for (const r of lemmas) this.learned.delete(r.lemma.toLowerCase());
      this.user.exec("COMMIT");
      this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('func_lexemes_pruned',?)")
        .run(String(lemmas.length));
      this._prunedFunctionLexemes = lemmas.map((r) => r.lemma);
    } catch (e) {
      this.user.exec("ROLLBACK");
      throw e;
    }
  }

`;
s = s.replace(anchor, method + anchor);
fs.writeFileSync(fp, s, "utf8");
console.log("method inserted");
