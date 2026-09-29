const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/dict.sqlite");
for (const w of ["creations","creators","researchers","requirements","economies","economists","finalise","computations","computerised","administrates","administrators","insecurities","secures","authored","authoring","refocus","refocussed","signified","signifies","similarities","responded","factored","funders","periodicals","projections","majorities","federations"]) {
  const r = db.prepare("SELECT frq,tag,exchange FROM words WHERE word=?").get(w);
  console.log(w, r ? `frq=${r.frq} tag=[${r.tag||""}] ex=${r.exchange||""}` : "MISSING");
}
const c = db.prepare("SELECT exchange FROM words WHERE word=?").get("create");
console.log("create ex:", c.exchange);
db.close();
