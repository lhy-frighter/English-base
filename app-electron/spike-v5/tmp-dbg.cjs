const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/dict.sqlite");
const st = db.prepare("SELECT translation,frq FROM words WHERE word=?").get("state");
console.log("state:", st.translation.split("\\n")[0]);
const first = st.translation.split("\\n")[0];
const m = first.match(/[一-鿿]{2,6}/); console.log("head:", m[0]);
for (const w of ["war","health","book","night","day"]) {
  const r = db.prepare("SELECT translation FROM words WHERE word=?").get(w);
  console.log(w, "=>", r.translation.split("\\n")[0].slice(0,60));
}
for (const w of ["childs","childness","childly","workes","stative","station"]) {
  const r = db.prepare("SELECT frq,tag FROM words WHERE word=?").get(w);
  console.log("frq", w, JSON.stringify(r));
}
db.close();
