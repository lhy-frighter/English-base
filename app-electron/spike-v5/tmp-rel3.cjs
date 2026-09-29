const { Core } = require("../core.cjs");
const path=require("path"),fs=require("fs"),os=require("os");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"x-")); const core=new Core(dir);
for (const w of ["denied","qualified","varied","sanctified","quarried","objectified","costed","spitted","tapestried","bustier","investigators","people","data","willing"]) console.log(w,"=>",core.canonical(w));
for (const w of ["be","her","them","me","french","party","war","bird","computer","spirit","neighbor","chairman","off","low","finally","concept","item","style"]) {
  console.log(w, "fam:", JSON.stringify(core.relatedWords(w).family.map(x=>x.word)));
}
core.user.close(); fs.rmSync(dir,{recursive:true,force:true});
