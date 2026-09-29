// spike-v5/verify-lex-fix.cjs — 用真实 ECDICT 验证粘连切分/断词裁决
const t = require("../import-tools.cjs");
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const db = new DatabaseSync(path.join(__dirname, "..", "data", "dict.sqlite"), { readOnly: true });
const wStmt = db.prepare("SELECT bnc,frq FROM words WHERE word=?");
const lStmt = db.prepare("SELECT lemma FROM lemma WHERE flexion=?");
const freqOk = (r) => !!r && ((Number(r.bnc) > 0 && Number(r.bnc) <= 12000) || Number(r.frq) >= 100);
const isWord = (w) => { if (!w || w.length < 2) return false; const k = String(w).toLowerCase(); return !!wStmt.get(k) || !!lStmt.get(k); };
const isCommonPiece = (w) => {
  const k = String(w).toLowerCase();
  if (k.length < 2) return false;
  if (freqOk(wStmt.get(k))) return true;
  const l = lStmt.get(k);
  return !!(l && freqOk(wStmt.get(l.lemma)));
};
const headRank = (w) => {
  const k = String(w).toLowerCase();
  const r = wStmt.get(k);
  if (r && Number(r.bnc) > 0) return Number(r.bnc);
  const l = lStmt.get(k);
  if (l) { const hr = wStmt.get(l.lemma); if (hr && Number(hr.bnc) > 0) return Number(hr.bnc); }
  return 999999;
};
const lex = { isWord, isCommonPiece, headRank };

const glued = ["butits","whatwe","applicationshouldbe","Lawwillneverbe","just-thisis","newlaws",
  "sequencealigned","sourcetarget","datapoints","samplingbased","loglikelihood","autoencoding",
  "hyperprior","infomax","minibatches","stepsizes","positionwise","attentionbased","alignmentforum",
  "lukaszkaiser","reparameterization","labelers","qiki","lrate","contemple","boostrapping",
  "chatbot","datapoint","subse","quently","tional","eters","xception","headi","dzi"];
console.log("== repairGluedWords ==");
for (const g of glued) console.log(g.padEnd(22), "→", t.repairGluedWords(g, lex));

console.log("\n== linesToParagraphs 词典裁决 ==");
const mk = (text, y) => ({ text, y, h: 10 });
const cases = [
  [["We need more infor-","mation now."], "information 直拼"],
  [["It is a position-","wise feed-forward layer."], "position-wise 保留"],
  [["An attention-","based model."], "attention-based 保留"],
  [["The transfor-","mations are linear."], "transformations 直拼"],
  [["English-","to-German translation."], "English-to-German 保留"],
];
for (const [lines, name] of cases) {
  const ls = lines.map((x, i) => mk(x, 100 - i * 12));
  console.log(name.padEnd(26), "→", t.linesToParagraphs(ls, isWord).join(" / "));
}

console.log("\n== 跨页断词 ==");
console.log(t.dehyphenatePageBreaks("the Subse-\n\nquently, the sample arrived", isWord));
console.log(t.dehyphenatePageBreaks("a na-\n\ntional inference problem", isWord));
console.log(t.dehyphenatePageBreaks("the param-\n\neters converge", isWord));
db.close();
