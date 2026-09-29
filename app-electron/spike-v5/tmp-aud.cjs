const { Core, extractSentence } = require("../core.cjs");
const path=require("path"),fs=require("fs"),os=require("os");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"aud-")); const core=new Core(dir);
for (const w of ["the","of","under","again","become","quick","investigate","activate","happy","work","big","child","start","still","state","school"]) {
  const r = core.relatedWords(w);
  console.log(w, "| fam:", r.family.map(x=>x.word).join(","), "| syn:", r.synonyms.slice(0,4).map(x=>x.word).join(","));
}
console.log("--- choices pos check ---");
let bad=0;
for (let t=0;t<20;t++){ const ch=core.meaningChoices("v. 调查，审查","investigate"); const posOk=ch.slice(1).every(g=>!/^\s*[a-z]{1,6}\./i.test(g)||/^\s*v\./i.test(g)); if(!posOk){bad++; console.log("POS LEAK:",ch.join(" | "));} }
console.log("pos leaks:",bad,"/20");
core.user.close(); fs.rmSync(dir,{recursive:true,force:true});
