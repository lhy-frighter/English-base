// 功能词不建卡：lookup 返回 cardable:false；三个 create 入口服务端拦截；启动一次性清理存量功能词词元
const fs = require("fs");
const fp = "core.cjs";
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

// A. lookup：功能词不建卡（保留释义供查看）
rep(
`      return null;
    }
    // 查词追踪：每百词查词密度的数据源`,
`      return null;
    }
    // 功能词（冠词/介词/连词/代词等封闭词类）不进 SRS，面板可查释义
    if (this.isFunctionLemma(r.lemma)) {
      return { ...r, cardable: false, kind: "function" };
    }
    // 查词追踪：每百词查词密度的数据源`,
"lookup 功能词分支");

// B1. createNote 拦截
rep(
`  createNote({ word, label, phrase, sense, textId, offset }) {
    const now = nowMs();
    const r = this.resolve(word, label, phrase);
    if (!r) throw new Error(\`未收录：\${word}\`);
    const lexemeId = this.upsertLexeme(r, sense);`,
`  createNote({ word, label, phrase, sense, textId, offset }) {
    const now = nowMs();
    const r = this.resolve(word, label, phrase);
    if (!r) throw new Error(\`未收录：\${word}\`);
    if (this.isFunctionLemma(r.lemma)) throw new Error(\`功能词不建卡：\${r.lemma}\`);
    const lexemeId = this.upsertLexeme(r, sense);`,
"createNote 拦截");

// B2. createStandaloneNote 拦截
rep(
`  createStandaloneNote({ word, label, phrase, sense }) {
    const now = nowMs();
    const r = this.resolve(word, label, phrase);
    if (!r) throw new Error(\`未收录：\${word}\`);
    const lexemeId = this.upsertLexeme(r, sense);`,
`  createStandaloneNote({ word, label, phrase, sense }) {
    const now = nowMs();
    const r = this.resolve(word, label, phrase);
    if (!r) throw new Error(\`未收录：\${word}\`);
    if (this.isFunctionLemma(r.lemma)) throw new Error(\`功能词不建卡：\${r.lemma}\`);
    const lexemeId = this.upsertLexeme(r, sense);`,
"createStandaloneNote 拦截");

// B3. createShadowNote 拦截
rep(
`    const r = this.resolve(word);
    if (!r) throw new Error(\`未收录：\${word}\`);
    const lemma = r.lemma.toLowerCase();`,
`    const r = this.resolve(word);
    if (!r) throw new Error(\`未收录：\${word}\`);
    if (this.isFunctionLemma(r.lemma)) throw new Error(\`功能词不建卡：\${r.lemma}\`);
    const lemma = r.lemma.toLowerCase();`,
"createShadowNote 拦截");

// C. 构造器调用一次性清理
rep(
`    this.cleanupEncountersV2();
    // S9-1：启动回收——上次未正常关闭的 open 会话按遗弃处理`,
`    this.cleanupEncountersV2();
    this.pruneFunctionLexemes();
    // S9-1：启动回收——上次未正常关闭的 open 会话按遗弃处理`,
"构造器调用清理");

// C2. 清理方法（挂在 pruneFunctionEncounters 之后）
const anchor = `  // 一次性清理：旧版 unknown_encounters 里的功能词行（app_settings 记录幂等）`;
const method = `  // 一次性清理：存量功能词词元及其笔记/卡片/复习记录（功能词永不进 SRS）
  pruneFunctionLexemes() {
    if (this.getSetting("func_lexemes_pruned")) return;
    const lemmas = this.user.prepare("SELECT id, lemma FROM lexemes WHERE pos<>'__concept__'").all()
      .filter((r) => this.isFunctionLemma(r.lemma));
    if (!lemmas.length) { this.setSetting("func_lexemes_pruned", 1); return; }
    const ids = lemmas.map((r) => r.id);
    const ph = ids.map(() => "?").join(",");
    const tx = this.user.exec.bind(this.user);
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
      this.setSetting("func_lexemes_pruned", lemmas.length);
      this._prunedFunctionLexemes = lemmas.map((r) => r.lemma);
    } catch (e) {
      this.user.exec("ROLLBACK");
      throw e;
    }
  }

`;
if (!s.includes("pruneFunctionLexemes()")) {
  if (!s.includes(anchor)) throw new Error("方法锚点缺失");
  s = s.replace(anchor, method + anchor);
  console.log("patched: 清理方法");
} else console.log("skip: 清理方法");

fs.writeFileSync(fp, s, "utf8");
console.log("core saved");
