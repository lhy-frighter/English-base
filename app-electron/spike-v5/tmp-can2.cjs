const { Core } = require("../core.cjs");
const path=require("path"),fs=require("fs"),os=require("os");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"can-")); const core=new Core(dir);
console.log("investigators =>", core.canonical("investigators"));
console.log("mechanisms =>", core.canonical("mechanisms"));
console.log("investigator =>", core.canonical("investigator"));
console.log("people =>", core.canonical("people"));
console.log("data =>", core.canonical("data"));
console.log("quicker =>", core.canonical("quicker"));
// 已学单数，阅读复数应判 learned
const rr = core.resolve("investigator","word",null);
core.upsertLexeme(rr, "n. 调查员");
const ann = core.annotate("The investigators examined the mechanism.");
const inv = ann.find(t=>/investigator/i.test(t.text));
console.log("plural learned flag:", inv && inv.learned);
// 相遇表归并
core.user.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES(?,?,?,?,?)").run("mechanisms",77,2,5,9);
core.user.prepare("INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at) VALUES(?,?,?,?,?)").run("mechanism",77,1,3,8);
core.user.prepare("DELETE FROM app_settings WHERE k='encounters_consolidated_v1'").run();
core.consolidateEncounterLemmas();
console.log(core.user.prepare("SELECT lemma,count,first_seen_at f,last_seen_at l FROM unknown_encounters WHERE text_id=77").all());
core.user.close(); fs.rmSync(dir,{recursive:true,force:true});
