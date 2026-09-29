const { Core } = require("../core.cjs");
const path=require("path"),fs=require("fs"),os=require("os");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"x-")); const core=new Core(dir);
for (const w of ["finally","final","style","item","concept","french","computer","party","communication","appropriate"]) {
  console.log(w, "=>", JSON.stringify(core.relatedWords(w).family.map(x=>x.word)));
}
core.user.close(); fs.rmSync(dir,{recursive:true,force:true});
