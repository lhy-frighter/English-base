// S8 勘查：验证修复假设——弯引号归一 + 规则屈折（含 frq 门控）后的残余 miss
const { Core } = require('../core.cjs');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs'), os = require('node:os');

const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's8-probe3-'));
const core = new Core(dir);

const normA = (s) => s.replace(/[‘’ʼ]/g, "'");
function frqOf(w) { const a = core.words.get(w); if (!a) return 0; const r = core.lookupWordRow(a, w); return r?.frq || 0; }

function morphy(w) {
  const c = new Set();
  if (w.endsWith('ies') && w.length > 4) { c.add(w.slice(0, -3) + 'y'); c.add(w.slice(0, -2)); }
  if (/(ses|xes|zes|ches|shes)$/.test(w)) c.add(w.slice(0, -2));
  if (w.endsWith('s') && !/(ss|us|is)$/.test(w) && w.length > 3) c.add(w.slice(0, -1));
  if (w.endsWith('ied') && w.length > 4) c.add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) { c.add(w.slice(0, -2)); c.add(w.slice(0, -1)); if (w.length > 4 && w[w.length-3] === w[w.length-4]) c.add(w.slice(0, -3)); }
  if (w.endsWith('ing')) { c.add(w.slice(0, -3) + 'e'); c.add(w.slice(0, -3)); if (w.length > 5 && w[w.length-4] === w[w.length-5]) c.add(w.slice(0, -4)); }
  if (w.endsWith('ier')) c.add(w.slice(0,-3)+'y');
  if (w.endsWith('iest')) c.add(w.slice(0,-4)+'y');
  if (w.endsWith('er') && w.length > 4) { c.add(w.slice(0, -2)); c.add(w.slice(0, -1)); if (w[w.length-3]===w[w.length-4]) c.add(w.slice(0,-3)); }
  if (w.endsWith('est') && w.length > 5) { c.add(w.slice(0, -3)); c.add(w.slice(0, -2)); if (w[w.length-4]===w[w.length-5]) c.add(w.slice(0,-4)); }
  const hits = [...c].filter(x => core.words.has(x));
  if (!hits.length) return null;
  hits.sort((a,b) => frqOf(b) - frqOf(a));
  return hits[0];
}

// frq of suspected false-positive lemmas
for (const w of ['rica','nida','lockdown','dreamworld','conceiver','melancholiac']) {
  console.log(`frq ${w}:`, frqOf(w));
}

const udb = new DatabaseSync(path.join(root, 'data', 'user.sqlite'), { readOnly: true });
const texts = udb.prepare("SELECT id,title,raw_text FROM texts").all();
udb.close();

const rem = new Map(), fixedApo = new Map(), fixedInfl = new Map();
for (const tx of texts) {
  const toks = core.annotate(tx.raw_text);
  for (const t of toks) {
    if (t.label !== 'miss') continue;
    const w0 = t.text.toLowerCase();
    const w = normA(w0);
    if (w !== w0 && w.includes("'")) {
      const left = w.slice(0, w.lastIndexOf("'"));
      if (core.resolvable(left)) { fixedApo.set(w0, (fixedApo.get(w0)||0)+1); continue; }
    }
    if (!/['-]/.test(w)) {
      const m = morphy(w);
      if (m) { fixedInfl.set(w0+' -> '+m, (fixedInfl.get(w0+' -> '+m)||0)+1); continue; }
    }
    rem.set(w0, (rem.get(w0)||0)+1);
  }
}
const tot = m => [...m.values()].reduce((a,b)=>a+b,0);
console.log('\n弯引号修复:', fixedApo.size, '形', tot(fixedApo), '次');
console.log('规则屈折修复:', fixedInfl.size, '形', tot(fixedInfl), '次');
[...fixedInfl.entries()].sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log('  ',v,'x',k));
console.log('\n残余 miss:', rem.size, '形', tot(rem), '次');
[...rem.entries()].sort((a,b)=>b[1]-a[1]).slice(0,70).forEach(([k,v])=>console.log('  ',v,'x',k));
fs.rmSync(dir, { recursive: true, force: true });
