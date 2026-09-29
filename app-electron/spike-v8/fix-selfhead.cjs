const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(cp, "utf8");
const old = `      const low = w.toLowerCase();
      let lem = this.lemmaOf.get(low);
      if (!lem) { try { lem = this.ruleLemma(low); } catch { lem = null; } }
      const base = lem || low;
      const note = this.user.prepare(\`SELECT 1 FROM notes n JOIN lexemes x ON x.id=n.lexeme_id
        WHERE n.text_id=? AND lower(x.lemma) IN (?,?)\`).get(textId, low, base);`;
const neu = `      const low = w.toLowerCase();
      // 点击词本身就是词典词目时以它为准（lemma 表个别脏行如 benefit→benefited 不采信）
      const selfHead = this.user.prepare(
        "SELECT 1 FROM dict.words WHERE word=?").get(low);
      let lem = this.lemmaOf.get(low);
      if (!lem) { try { lem = this.ruleLemma(low); } catch { lem = null; } }
      const base = selfHead ? low : (lem || low);
      const note = this.user.prepare(\`SELECT 1 FROM notes n JOIN lexemes x ON x.id=n.lexeme_id
        WHERE n.text_id=? AND lower(x.lemma) IN (?,?)\`).get(textId, low, base);`;
if (s.indexOf(old) === -1) throw new Error("anchor missing");
s = s.replace(old, neu);
fs.writeFileSync(cp, s);
console.log("fixed");
