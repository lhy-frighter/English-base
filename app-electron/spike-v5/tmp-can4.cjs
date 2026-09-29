const { Core } = require("../core.cjs");
const path=require("path"),fs=require("fs"),os=require("os");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"x-")); const core=new Core(dir);
for (const w of ["bustier","better","worse","denied","investigators","neighboring","people","data","media","quicker","studying","ferreted"]) console.log(w,"=>",core.canonical(w));
core.user.close(); fs.rmSync(dir,{recursive:true,force:true});
