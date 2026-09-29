const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/dict.sqlite");
for (const w of ["quicker","quickest","people","data","media","investigators","investigator","better","worse","children","went","studies","studying"]) {
  const r = db.prepare("SELECT exchange,frq FROM words WHERE word=?").get(w);
  const lem = db.prepare("SELECT lemma FROM lemma WHERE flexion=?").all(w).map(x=>x.lemma).join(",");
  console.log(w, "| ex:", r&&r.exchange, "| frq:", r&&r.frq, "| lemma:", lem);
}
db.close();
