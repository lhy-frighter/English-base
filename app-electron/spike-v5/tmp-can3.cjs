const { Core } = require("../core.cjs");
const path=require("path"),fs=require("fs"),os=require("os");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"can-")); const core=new Core(dir);
for (const w of ["quicker","quickest","studying","studies","better","worse","children","went","people","data","media","investigators","investigator"]) console.log(w,"=>",core.canonical(w));
core.user.close(); fs.rmSync(dir,{recursive:true,force:true});
