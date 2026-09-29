const { DatabaseSync } = require("node:sqlite");
const dict=new DatabaseSync("data/dict.sqlite");
for (const w of ["labeler","incentivize","eval","workes","catings","computaters","finalise","adversarial","quickly","ferrete","neighbore"]) {
  const r=dict.prepare("SELECT frq,tag,translation,definition FROM words WHERE word=?").get(w);
  if(!r){console.log(w,"MISSING");continue;}
  console.log(w,`frq=${r.frq} tag=[${r.tag||""}] tr=[${(r.translation||"").slice(0,30)}] def=${r.definition?1:0}`);
}
// 统计：frq=0 但有中文翻译的词头数量 vs frq=0 无翻译
const a=dict.prepare("SELECT COUNT(*) n FROM words WHERE frq=0 AND translation<>''").get().n;
const b=dict.prepare("SELECT COUNT(*) n FROM words WHERE frq=0 AND (translation IS NULL OR translation='')").get().n;
console.log("frq0 有翻译:",a," frq0 无翻译:",b);
dict.close();
