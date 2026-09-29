// S8a 快速验收：弯引号/规则屈折在 annotate 下的标签 + 全语料 miss 前后对比
const { Core } = require('../core.cjs');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs'), os = require('node:os');

const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's8-verify-'));
const core = new Core(dir);

function labels(sent) {
  return core.annotate(sent).filter(t => t.label !== 'punct').map(t => `${t.text}:${t.label}`);
}
const cases = [
  "It’s a test. You’re right. They’d agree. I’m fine.",
  "He didn’t go. She won’t stop. They can’t swim. It doesn’t work.",
  "The world’s economies. Aristotle’s works. One’s choice.",
  "Studies show lockdowns and dreamworlds.",
  "The studies analyzed running systems and stopped processes.",
  "Ricas comidas are Spanish (should not fake-resolve).",
];
for (const c of cases) console.log(labels(c).join(' '), '\n');

// resolve 直查
for (const w of ['didn’t', "world’s", 'studies', 'running', 'larger', 'biggest', 'ricas', 'eagle', 'actioning']) {
  const r = core.resolve(w, 'word', null);
  console.log('resolve', w, '->', r?.lemma || 'NULL');
}

// 全语料 miss 统计
const udb = new DatabaseSync(path.join(root, 'data', 'user.sqlite'), { readOnly: true });
const texts = udb.prepare("SELECT raw_text FROM texts").all();
udb.close();
const miss = new Map();
for (const tx of texts) for (const t of core.annotate(tx.raw_text)) {
  if (t.label === 'miss') miss.set(t.text.toLowerCase(), (miss.get(t.text.toLowerCase()) || 0) + 1);
}
const tot = [...miss.values()].reduce((a, b) => a + b, 0);
console.log('\n残余 miss:', miss.size, '形', tot, '次');
console.log([...miss.entries()].sort((a,b)=>b[1]-a[1]).slice(0,40).map(([w,c])=>`${c}x ${w}`).join('\n'));
fs.rmSync(dir, { recursive: true, force: true });
