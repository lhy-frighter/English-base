// S8 勘查：全部内置文章 miss 词分类——规则屈折可救 / 连字符复合 / PDF 粘连 / 其他
const { Core } = require('../core.cjs');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs'), os = require('node:os');

const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's8-probe2-'));
const core = new Core(dir);

// ---- Morphy 风格规则候选（仅屈折，不做派生），返回候选词头列表 ----
function morphyCandidates(w) {
  const c = new Set();
  const has = (s) => core.words.has(s);
  // 名词复数 / 动词三单
  if (w.endsWith('ies') && w.length > 4) { c.add(w.slice(0, -3) + 'y'); c.add(w.slice(0, -2)); } // studies->study, armies->army
  if (w.endsWith('ses') || w.endsWith('xes') || w.endsWith('zes') || w.endsWith('ches') || w.endsWith('shes')) c.add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') && w.length > 3) c.add(w.slice(0, -1));
  // 动词过去式/分词
  if (w.endsWith('ied') && w.length > 4) c.add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) {
    c.add(w.slice(0, -2));           // played->play
    c.add(w.slice(0, -1));           // liked->like (d)
    if (w.length > 4 && w[w.length - 3] === w[w.length - 4]) c.add(w.slice(0, -3)); // stopped->stop (doubled)
  }
  // 现在分词
  if (w.endsWith('ing')) {
    c.add(w.slice(0, -3) + 'e');    // liking->like
    c.add(w.slice(0, -3));          // playing->play
    if (w.length > 5 && w[w.length - 4] === w[w.length - 5]) c.add(w.slice(0, -4)); // running->run
  }
  // 比较级/最高级
  if (w.endsWith('er') && w.length > 4) { c.add(w.slice(0, -2)); c.add(w.slice(0, -1)); if (w[w.length-3]===w[w.length-4]) c.add(w.slice(0,-3)); }
  if (w.endsWith('est') && w.length > 5) { c.add(w.slice(0, -3)); c.add(w.slice(0, -2)); if (w[w.length-4]===w[w.length-5]) c.add(w.slice(0,-4)); }
  if (w.endsWith('ier')) c.add(w.slice(0,-3)+'y');
  if (w.endsWith('iest')) c.add(w.slice(0,-4)+'y');
  return [...c].filter(has);
}

// 粗判 PDF 粘连：能否切成两段都在词表中的词
function glueSplit(w) {
  for (let i = 2; i < w.length - 2; i++) {
    const a = w.slice(0, i), b = w.slice(i);
    if (core.resolvable(a) && core.resolvable(b)) return [a, b];
  }
  return null;
}

const udb = new DatabaseSync(path.join(root, 'data', 'user.sqlite'), { readOnly: true });
const texts = udb.prepare("SELECT id,title,raw_text FROM texts").all();
udb.close();

const buckets = { inflection: new Map(), compound: new Map(), glue: new Map(), other: new Map() };
for (const tx of texts) {
  const toks = core.annotate(tx.raw_text);
  for (const t of toks) {
    if (t.label !== 'miss') continue;
    const w = t.text.toLowerCase();
    const key = w;
    const bump = (m) => m.set(key, (m.get(key) || 0) + 1);
    if (w.includes('-')) { const parts = w.split('-').filter(Boolean); if (parts.every(p => core.resolvable(p))) { bump(buckets.compound); continue; } }
    const mc = morphyCandidates(w);
    if (mc.length) { buckets.inflection.set(key, (buckets.inflection.get(key)||0)+1); (buckets.inflection.get('_detail') || buckets.inflection.set('_detail', new Map()).get('_detail')).set(w, mc.join('/')); continue; }
    const g = glueSplit(w);
    if (g) { bump(buckets.glue); const d = buckets.glue.get('_detail') || buckets.glue.set('_detail', new Map()).get('_detail'); d.set(w, g.join('|')); continue; }
    bump(buckets.other);
  }
}
const show = (name, m, lim = 60) => {
  const det = m.get('_detail'); m.delete('_detail');
  const tot = [...m.values()].reduce((a,b)=>a+b,0);
  console.log(`\n=== ${name}: ${m.size} 形 / ${tot} 次`);
  const arr = [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0, lim);
  for (const [w,c] of arr) console.log(`  ${c}x ${w}${det && det.has(w) ? '  -> ' + det.get(w) : ''}`);
};
show('规则屈折可救', buckets.inflection);
show('连字符复合(各段可解)', buckets.compound, 30);
show('PDF 粘连(可切两段)', buckets.glue, 40);
show('其他真·未收录', buckets.other, 80);
fs.rmSync(dir, { recursive: true, force: true });
