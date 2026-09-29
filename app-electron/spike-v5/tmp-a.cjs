const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/dict.sqlite");
for (const w of ["a","an","the","of"]) { const r=db.prepare("SELECT translation FROM words WHERE word=?").get(w); console.log(w,"=>",JSON.stringify(r&&r.translation.slice(0,40))); }
db.close();
