const { Core } = require("../core.cjs");
const path=require("path"),fs=require("fs"),os=require("os");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"fw-")); const core=new Core(dir);
core.annotateAndSave("The committee of investigators and a senator will analyze the mechanism thoroughly tomorrow.", "t");
let rows = core.user.prepare("SELECT lemma,count FROM unknown_encounters ORDER BY count DESC").all();
console.log("encounters:", rows.map(r=>r.lemma).join(","));
console.log("has function:", rows.some(r=>["the","of","and","a","will"].includes(r.lemma)));
console.log("isFunc the/a/of/would/again:", ["the","a","of","would","again"].map(w=>w+"="+core.isFunctionLemma(w)).join(" "));
console.log("isContent investigate/quick/mechanism:", ["investigate","quick","mechanism"].map(w=>w+"="+core.isFunctionLemma(w)).join(" "));
// 存量清理：模拟旧污染行后重跑
core.user.prepare("DELETE FROM app_settings WHERE k='func_encounters_pruned'").run();
core.user.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES(?,?,?,?,?)").run("the",999,3,1,1);
core.user.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES(?,?,?,?,?)").run("of",999,2,1,1);
core.pruneFunctionEncounters();
const left = core.user.prepare("SELECT lemma FROM unknown_encounters WHERE text_id=999").all();
console.log("polluted rows after prune:", left.length);
const key = core.user.prepare("SELECT v FROM app_settings WHERE k='func_encounters_pruned'").get();
console.log("prune marker:", key && key.v);
core.user.close(); fs.rmSync(dir,{recursive:true,force:true});
