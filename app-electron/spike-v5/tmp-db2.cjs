const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/user.sqlite");
console.log("after rows:", db.prepare("SELECT COUNT(*) n FROM unknown_encounters").get().n);
console.log("function rows:", db.prepare("SELECT COUNT(*) n FROM unknown_encounters WHERE lemma IN ('the','of','and','a','to','in','is','that','it','we','this')").get().n);
console.log("settings:", db.prepare("SELECT k,v FROM app_settings WHERE k LIKE '%encounters%' OR k LIKE '%pruned%'").all());
console.log("sample:", db.prepare("SELECT lemma, SUM(count) c FROM unknown_encounters GROUP BY lemma ORDER BY c DESC LIMIT 12").all());
db.close();
