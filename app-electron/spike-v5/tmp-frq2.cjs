const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/dict.sqlite");
for (const w of ["became","becoming","becomes","started","starting","starts","happier","happiest","faster","longer","older","partied","birded","warred","frenches","chairmen","computable","lowing","partial","neighborly"]) {
  const r = db.prepare("SELECT frq,tag,exchange FROM words WHERE word=?").get(w);
  console.log(w, r ? `frq=${r.frq} tag=[${r.tag||""}] ex=${r.exchange||""}` : "MISSING");
}
db.close();
