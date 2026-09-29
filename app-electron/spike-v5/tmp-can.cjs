const { Core } = require("../core.cjs");
const path=require("path"),fs=require("fs"),os=require("os");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"c-")); const core=new Core(dir);
for (const w of ["investigators","mechanisms","analyses","thoroughly","senators","committees"]) console.log(w, "=>", core.canonical(w));
core.user.close(); fs.rmSync(dir,{recursive:true,force:true});
