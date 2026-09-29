const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/dict.sqlite");
for (const w of ["investigators","mechanisms","senators","committees","analyses","investigator","mechanism"]) {
  const lem = db.prepare("SELECT * FROM lemma WHERE flexion=?").all(w);
  const wrd = db.prepare("SELECT exchange,frq FROM words WHERE word=?").get(w);
  console.log(w, "| lemma:", JSON.stringify(lem), "| exchange:", wrd&&wrd.exchange, "| frq:", wrd&&wrd.frq);
}
db.close();
