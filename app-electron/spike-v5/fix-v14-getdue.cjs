const fs = require("fs");

// ============ core.cjs getDue 资产化 ============
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let c = fs.readFileSync(cp, "utf8");
function repC(oldStr, newStr, label) {
  if (!c.includes(oldStr)) throw new Error("CORE NOT FOUND: " + label);
  c = c.replace(oldStr, newStr);
}
repC(
  `"SELECT id, note_id, card_type, state FROM cards WHERE state!=0 AND due<=? ORDER BY due LIMIT ?"`,
  `"SELECT id, note_id, asset_id, card_type, state FROM cards WHERE state!=0 AND due<=? ORDER BY due LIMIT ?"`,
  "due select"
);
repC(
  `"SELECT id, note_id, card_type, state FROM cards WHERE state=0 ORDER BY created_at LIMIT ?"`,
  `"SELECT id, note_id, asset_id, card_type, state FROM cards WHERE state=0 ORDER BY created_at LIMIT ?"`,
  "fresh select"
);
repC(
  `    const seenNotes = new Set();
    const out = [];
    for (const row of queue) {
      if (seenNotes.has(row.note_id)) continue; // 兄弟卡互埋
      seenNotes.add(row.note_id);
      const n = this.user
        .prepare("SELECT n.context_sentence AS sentence, n.text_id AS text_id, l.lemma, l.sense FROM notes n JOIN lexemes l ON l.id=n.lexeme_id WHERE n.id=?")
        .get(row.note_id);
      const d = this.user
        .prepare("SELECT phonetic, exchange, definition, translation FROM dict.words WHERE word=?")
        .get(n.lemma) || { phonetic: "", exchange: "" };`,
  `    const seenOwners = new Set();
    const out = [];
    for (const row of queue) {
      // 归属键：词卡 note:<id>，资产卡 asset:<id>（asset 卡 note_id 为 NULL，不能再用 note_id 互埋）
      const ownerKey = row.note_id != null ? \`note:\${row.note_id}\` : \`asset:\${row.asset_id}\`;
      if (seenOwners.has(ownerKey)) continue; // 兄弟卡互埋
      seenOwners.add(ownerKey);
      let n, d;
      if (row.note_id != null) {
        n = this.user
          .prepare("SELECT n.context_sentence AS sentence, n.text_id AS text_id, l.lemma, l.sense FROM notes n JOIN lexemes l ON l.id=n.lexeme_id WHERE n.id=?")
          .get(row.note_id);
        d = this.user
          .prepare("SELECT phonetic, exchange, definition, translation FROM dict.words WHERE word=?")
          .get(n.lemma) || { phonetic: "", exchange: "" };
      } else {
        // 资产卡：从 learning_assets 取通用 DTO；chunk/grammar/pron 的专属渲染在 #142
        const a = this.user
          .prepare("SELECT asset_kind, canonical, gloss, payload_json FROM learning_assets WHERE id=?")
          .get(row.asset_id);
        const payload = JSON.parse(a.payload_json || "{}");
        n = {
          sentence: payload.example_en || a.gloss || a.canonical,
          text_id: null, lemma: a.canonical, sense: a.gloss,
        };
        d = { phonetic: "", exchange: "", definition: "", translation: "" };
      }`,
  "loop"
);
repC(
  `      out.push({
        card_id: row.id, note_id: row.note_id, card_type: row.card_type,`,
  `      out.push({
        card_id: row.id, note_id: row.note_id, asset_id: row.asset_id ?? null, card_type: row.card_type,`,
  "dto"
);
fs.writeFileSync(cp, c);

// ============ test: afterCards 只比原列 ============
const tp = "D:/vibe coding/英语学习/app-electron/test/v14-migration.cjs";
let t = fs.readFileSync(tp, "utf8");
const oldCols = `const afterCards = dump("SELECT * FROM cards ORDER BY id");`;
const newCols = `const afterCards = dump("SELECT id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at FROM cards ORDER BY id");`;
if (!t.includes(oldCols)) throw new Error("TEST anchor missing");
t = t.replace(oldCols, newCols);
// 可重入处的 SELECT * 同样改为显式列
const oldRe = `check("迁移可重入（cards 不增不减）",
  dump("SELECT * FROM cards ORDER BY id").length === beforeCounts.cards);`;
const newRe = `check("迁移可重入（cards 不增不减）",
  dump("SELECT id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at FROM cards ORDER BY id").length === beforeCounts.cards);`;
if (!t.includes(oldRe)) throw new Error("TEST reentry anchor missing");
t = t.replace(oldRe, newRe);
fs.writeFileSync(tp, t);
console.log("getDue asset-ified + test columns fixed");
