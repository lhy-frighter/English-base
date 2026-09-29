const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const db = new DatabaseSync(path.join(__dirname, "..", "data", "dict.sqlite"), { readOnly: true });
const wStmt = db.prepare("SELECT bnc,frq FROM words WHERE word=?");
const lStmt = db.prepare("SELECT lemma FROM lemma WHERE flexion=?");
for (const w of ["con","ic","tion","ence","ance","ment","ness","ing","ers","ter","ple","ple","law","log","max","new","bot","its","we","is","be","art","age","mat","ram","ers","sub","mar","tin","tra","rap","boo","trapping","wise","mini","info"]) {
  const r = wStmt.get(w); const l = lStmt.get(w);
  console.log(w.padEnd(10), r ? `bnc=${String(r.bnc).padStart(6)} frq=${String(r.frq).padStart(6)}` : "—", l ? `lemma=${l.lemma}` : "");
}
db.close();
