const path = require("path"), fs = require("fs"), os = require("os");
const { Core } = require("../core.cjs");
const srcDb = path.resolve(__dirname, "..", "data", "user.sqlite");
const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "rec-real-"));
fs.mkdirSync(path.join(appdata, "data"), { recursive: true });
fs.copyFileSync(srcDb, path.join(appdata, "data", "user.sqlite"));
const core = new Core(appdata);
const db = core.user;
console.log("encounters:", db.prepare("SELECT COUNT(*) n FROM unknown_encounters").get().n);
console.log("distinct lemmas:", db.prepare("SELECT COUNT(DISTINCT lemma) n FROM unknown_encounters").get().n);
console.log("lexemes:", db.prepare("SELECT COUNT(*) n FROM lexemes").get().n);
const noAsset = db.prepare(`SELECT COUNT(DISTINCT u.lemma) n FROM unknown_encounters u
  WHERE NOT EXISTS (SELECT 1 FROM lexemes l WHERE l.lemma=u.lemma AND l.pos<>'__concept__')`).get().n;
console.log("distinct without asset:", noAsset);
const sample = db.prepare(`SELECT u.lemma, COUNT(DISTINCT u.text_id) texts FROM unknown_encounters u
  WHERE NOT EXISTS (SELECT 1 FROM lexemes l WHERE l.lemma=u.lemma AND l.pos<>'__concept__')
  GROUP BY u.lemma ORDER BY texts DESC LIMIT 10`).all();
console.log(sample);
// words map?
console.log("words.has(mechanism):", core.words.has("mechanism"));
const row = db.prepare("SELECT DISTINCT lemma FROM unknown_encounters LIMIT 5").all();
console.log("sample lemmas:", row);
for (const r of row) {
  const alias = core.words.get(r.lemma);
  console.log(r.lemma, "->", alias, alias ? !!core.lookupWordRow(alias, r.lemma) : "no-alias", "func?", core.isFunctionLemma(r.lemma));
}
core.user.close();
fs.rmSync(appdata, { recursive: true, force: true });
