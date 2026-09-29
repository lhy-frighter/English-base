const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const root = path.join(__dirname, '..');
const db = new DatabaseSync(path.join(root, 'data', 'dict.sqlite'), { readOnly: true });
console.log('tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name).join(', '));
for (const t of ['words', 'lemma', 'mwe']) {
  try { const c = db.prepare('SELECT COUNT(*) n FROM ' + t).get(); console.log(t, c.n); } catch (e) { console.log(t, 'ERR', e.message); }
}
console.log('words cols:', db.prepare("PRAGMA table_info(words)").all().map(c => c.name).join(','));
try { console.log('lemma cols:', db.prepare("PRAGMA table_info(lemma)").all().map(c => c.name).join(',')); } catch (e) {}
try { console.log('mwe cols:', db.prepare("PRAGMA table_info(mwe)").all().map(c => c.name).join(',')); } catch (e) {}
try { console.log('meta:', JSON.stringify(db.prepare('SELECT * FROM meta').all())); } catch (e) {}
console.log('lemma sample:', JSON.stringify(db.prepare('SELECT * FROM lemma LIMIT 8').all()));
// exchange field sample
console.log('exchange sample:', JSON.stringify(db.prepare("SELECT word, exchange FROM words WHERE exchange<>'' LIMIT 5").all()));
db.close();
