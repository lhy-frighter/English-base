const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/dict.sqlite");
for (const w of ["frenches","hering","thems","mes","was","is","been","being","partied","partying","warred","warring","birded","birding","chairmanning","spiriting","spirited","neighbored","neighboring","negativing","offed","offing","lowed","lower","others","otherness","justly","justness","computable","computation","willing","could","denied","deny","qualified","qualify","varied","vary","sanctified","sanctify","costed","cost","quarried","quarry","adhereing","belying","spitted","spit","bustier","busty","turkomen","turkoman","objectified","objectify","tapestried","transmogrified"]) {
  const r = db.prepare("SELECT frq,tag,exchange FROM words WHERE word=?").get(w);
  console.log(w, r ? `frq=${r.frq} tag=${r.tag||""} ex=${r.exchange||""}` : "MISSING");
}
db.close();
