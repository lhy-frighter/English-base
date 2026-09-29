const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/user.sqlite");
console.log("before rows:", db.prepare("SELECT COUNT(*) n FROM unknown_encounters").get().n);
console.log("function rows:", db.prepare("SELECT COUNT(*) n FROM unknown_encounters WHERE lemma IN ('the','of','and','a','to','in','is','that')").get().n);
db.close();
