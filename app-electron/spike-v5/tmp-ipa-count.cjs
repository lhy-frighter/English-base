const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/packs/wikt-en.sqlite', { readOnly: true });
const t = db.prepare('SELECT COUNT(*) n FROM words').get().n;
const h = db.prepare("SELECT COUNT(*) n FROM words WHERE phonetic!=''").get().n;
console.log('IPA', h + '/' + t, (100 * h / t).toFixed(1) + '%');
const x = db.prepare("SELECT word,phonetic FROM words WHERE word IN ('abso-fucking-lutely','gamify','crocodylomorph','heliocentrism')").all();
for (const r of x) console.log(r.word, '->', r.phonetic);
db.close();
