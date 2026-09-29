// S8 勘查：在真实文本上统计 miss 词，并分析规则屈折还原（Morphy 子集）能救回多少
const { Core } = require('../core.cjs');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs'), os = require('node:os');

const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's8-probe-'));
const core = new Core(dir);

// 找到 Attention 文章
const udb = new DatabaseSync(path.join(root, 'data', 'user.sqlite'), { readOnly: true });
const rows = udb.prepare("SELECT id, title, length(raw_text) len FROM texts ORDER BY id").all();
console.log('texts:');
for (const r of rows) console.log(' ', r.id, r.len, JSON.stringify(r.title));
const att = udb.prepare("SELECT raw_text FROM texts WHERE title LIKE '%attention%' OR title LIKE '%Attention%' LIMIT 1").get();
udb.close();
if (!att) { console.log('no attention article'); process.exit(0); }

const toks = core.annotate(att.raw_text);
const miss = new Map();
const proper = new Map();
for (const t of toks) {
  if (t.label === 'miss') miss.set(t.text.toLowerCase(), (miss.get(t.text.toLowerCase()) || 0) + 1);
  if (t.label === 'proper') proper.set(t.text.toLowerCase(), (proper.get(t.text.toLowerCase()) || 0) + 1);
}
console.log('\nMISS tokens(unique):', miss.size, ' total occurrences:', [...miss.values()].reduce((a,b)=>a+b,0));
const sorted = [...miss.entries()].sort((a,b)=>b[1]-a[1]);
console.log('\n--- top 80 miss ---');
console.log(sorted.slice(0,80).map(([w,c])=>`${c}x ${w}`).join('\n'));

fs.rmSync(dir, { recursive: true, force: true });
