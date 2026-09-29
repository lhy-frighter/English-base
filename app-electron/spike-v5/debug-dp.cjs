const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const db = new DatabaseSync(path.join(__dirname, "..", "data", "dict.sqlite"), { readOnly: true });
const wStmt = db.prepare("SELECT bnc,frq FROM words WHERE word=?");
const lStmt = db.prepare("SELECT lemma FROM lemma WHERE flexion=?");
const freqOk = (r) => !!r && ((Number(r.bnc) > 0 && Number(r.bnc) <= 12000) || Number(r.frq) >= 100);
const isCommonPiece = (w) => {
  const k = String(w).toLowerCase();
  if (freqOk(wStmt.get(k))) return true;
  const l = lStmt.get(k);
  return !!(l && freqOk(wStmt.get(l.lemma)));
};
for (const w of ["law","will","never","be","log","likelihood","info","max","this","is","trapping","boos","chat","bot"]) {
  const r = wStmt.get(w); const l = lStmt.get(w);
  console.log(w.padEnd(12), r ? `bnc=${r.bnc} frq=${r.frq}` : "no-words", l ? `lemma=${l.lemma}` : "", "common=", isCommonPiece(w));
}
db.close();
