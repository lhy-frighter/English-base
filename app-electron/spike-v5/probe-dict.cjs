// spike-v5/probe-dict.cjs — 粘连切分词信号校准
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const dict = new DatabaseSync(path.join(__dirname, "..", "data", "dict.sqlite"), { readOnly: true });
for (const w of ["based","points","laws","batches","wise","ic","mart","tion","ence","subse","quently","eters","info","max","hyper","prior","mini","this","is","be","we","its","but","data","model","head","rate","learning","should","application","never","will","law","new","aligned","sequence","source","target","forum","log","likelihood","auto","encoding","sampling","attention","position","based","wise","joined","transformations","information","subsequently","parameters","national"]) {
  const r = dict.prepare("SELECT bnc,frq,tag,exchange FROM words WHERE word=?").get(w);
  const lem = dict.prepare("SELECT lemma FROM lemma WHERE flexion=?").get(w);
  console.log(w.padEnd(16), r ? `bnc=${String(r.bnc).padStart(6)} frq=${String(r.frq).padStart(6)} tag=${(r.tag||"").slice(0,18)} ex=${(r.exchange||"").slice(0,20)}` : "—", lem ? `lemma=${lem.lemma}` : "");
}
dict.close();
