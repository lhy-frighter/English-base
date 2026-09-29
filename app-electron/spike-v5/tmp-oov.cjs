const { Core } = require("../core.cjs");
const { DatabaseSync } = require("node:sqlite");
const path=require("path"),fs=require("fs"),os=require("os");
const dict=new DatabaseSync("data/dict.sqlite");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"x-")); const core=new Core(dir);
for (const w of ["labelers","adversarially","misspecified","incentivizes","evals","reparameterization","reparameterize","lrate","evaluatoins"]) {
  const can=core.canonical(w);
  const hit=dict.prepare("SELECT frq,tag FROM words WHERE word=?").get(can);
  const toks=core.annotate(w+" .");
  console.log(w,"canonical=>",can, hit?`HIT frq${hit.frq} [${hit.tag||""}]`:"(无)", "| annotate label:", toks[0].label);
}
core.user.close(); fs.rmSync(dir,{recursive:true,force:true}); dict.close();
