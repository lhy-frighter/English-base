const { Core } = require("../core.cjs");
const path=require("path"),fs=require("fs"),os=require("os");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"x-")); const core=new Core(dir);
for (const w of ["become","start","happy","party","war","bird","french","computer","chairman","low","spirit","neighbor","be","her"]) {
  console.log(w, "fam:", JSON.stringify(core.relatedWords(w).family.map(x=>x.word)));
}
core.user.close(); fs.rmSync(dir,{recursive:true,force:true});
