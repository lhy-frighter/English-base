const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("D:/vibe coding/英语学习/app-electron/data/user.sqlite");
const rows = db.prepare("SELECT k, substr(v,1,200) v FROM app_settings WHERE k LIKE '%window%' OR k LIKE '%win%' OR k LIKE '%bounds%' OR k LIKE '%state%'").all();
console.log(JSON.stringify(rows, null, 1));
db.close();
