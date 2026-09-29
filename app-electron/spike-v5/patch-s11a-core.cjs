// S11-a：getDue 输出 text_id（复习卡一键回语境）
const fs = require("fs");
const fp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}
rep(
`"SELECT n.context_sentence AS sentence, l.lemma, l.sense FROM notes n JOIN lexemes l ON l.id=n.lexeme_id WHERE n.id=?"`,
`"SELECT n.context_sentence AS sentence, n.text_id AS text_id, l.lemma, l.sense FROM notes n JOIN lexemes l ON l.id=n.lexeme_id WHERE n.id=?"`,
"note 查询加 text_id");
rep(
`        sentence: shown, full: n.sentence, word: n.lemma,`,
`        sentence: shown, full: n.sentence, text_id: n.text_id ?? null, word: n.lemma,`,
"输出 text_id");
fs.writeFileSync(fp, s, "utf8");
console.log("完成", n);
