const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/dict.sqlite");
for (const w of ["finally","final","style","item","concept","context","category","party","bird","war","french","computer","analysis","traditional","communication","appropriate","investigated","partied","was","been","her","them","me","other","just","expert","focus","spirit","neighbor","chairman","negative","off","low","global","normal","institution","tradition"]) {
  const r = db.prepare("SELECT exchange,frq,tag FROM words WHERE word=?").get(w);
  console.log(w, "| ex:", r&&r.exchange, "| frq:", r&&r.frq, "| tag:", r&&r.tag);
}
db.close();
