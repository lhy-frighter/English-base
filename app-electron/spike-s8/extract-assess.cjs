const b = require('../data/builtins.cjs');
const items = Array.isArray(b) ? b : (b.builtins || Object.values(b)[0]);
const pick = ['The Right to Repair','Night Buses Return as Cities Rethink the Late Shift',
  'Why Universities Are Bringing Back Oral Exams','Urban Green Spaces and Public Health',
  'Spacing Effects in L2 Vocabulary: A Replication Study','Nighttime Street Lighting and Urban Heat'];
const fs = require('fs');
for (const t of pick) {
  const it = items.find(x => x.title === t);
  if (!it) throw new Error('missing ' + t);
  const body = it.paras ? it.paras.map((p) => (typeof p === "string" ? p : (p.en || p.text || JSON.stringify(p)))).join('\n\n') : it.text;
  fs.writeFileSync('spike-s8/assess-' + it.id + '.txt', `TITLE: ${it.title}\nLEVEL: ${it.level}\nGENRE: ${it.genre}\nWORDS: ${it.words}\n\n${body}`);
  console.log(it.id, it.title, body.length);
}
