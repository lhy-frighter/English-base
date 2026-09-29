const { Core } = require("../core.cjs");
const path=require("path"),fs=require("fs"),os=require("os");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"x-")); const core=new Core(dir);
for (const b of core.builtins) {
  const toks=core.annotate(b.text);
  const lex=toks.filter(t=>t.label!=="punct"&&t.label!=="proper"&&t.label!=="number");
  console.log((b.id||b.title||"?").slice(0,28).padEnd(30), "CEFR:", core.textCefr(lex), "lex:", lex.length);
}
core.user.close(); fs.rmSync(dir,{recursive:true,force:true});
