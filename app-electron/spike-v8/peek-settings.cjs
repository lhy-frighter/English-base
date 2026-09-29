const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("D:/vibe coding/英语学习/app-electron/data/user.sqlite");
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE name='app_settings'").get().sql);
console.log(db.prepare("SELECT * FROM app_settings").all());
db.close();
