const { DatabaseSync } = require("node:sqlite");
const dict=new DatabaseSync("data/dict.sqlite");
for (const w of ["labeler","labelers","adversarial","adversarially","misspecify","misspecified","incentivize","incentivizes","eval","evals","reparameterization","reparameterize"]) {
  const r=dict.prepare("SELECT frq,tag,exchange FROM words WHERE word=?").get(w);
  console.log(w, r?`frq=${r.frq} tag=[${r.tag||""}] ex=${r.exchange||""}`:"MISSING");
}
dict.close();
