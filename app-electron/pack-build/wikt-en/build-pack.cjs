// build-pack.cjs — 由 wiktextract（kaikki 英文转储）+ FrequencyWords 频度表构建 data/packs/wikt-en.sqlite
// 输入（构建期数据，不随应用分发）：
//   spike-s8/wikt/en.jsonl.gz   wiktextract English JSONL（CC-BY-SA-4.0，Wiktionary 贡献者）
//   spike-s8/wikt/en_full.txt   FrequencyWords 2018 en_full（CC-BY-SA-4.0，OpenSubtitles）
// 选词：小写通用词头、ECDICT 缺失、标准 en-* head_tmpl、至少一个无 obsolete/archaic/rare/misspelling
//       等标签的干净义项，且 FrequencyWords rank ≤ RANK_MAX；另加 DEMAND（真实语料残余 miss 词）。
// 运行：node pack-build/wikt-en/build-pack.cjs
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const readline = require('node:readline');

const ROOT = path.join(__dirname, '..', '..');
const SPIKE = path.join(ROOT, 'spike-s8', 'wikt');
const OUT_DIR = path.join(ROOT, 'data', 'packs');
const OUT = path.join(OUT_DIR, 'wikt-en.sqlite');
const STAGE = OUT + '.stage';
const RANK_MAX = 200000;

// 真实语料（8 篇）经 S8a/S8b 后仍残余的真英语新词/派生词，无频度也强制收录
const DEMAND = new Set(['gamify','gamification','heliocentrism','subseafloor','recombinatory','instrumentalise',
  'instrumentalize','fetishisation','fetishization','uncreative','uncreatively','recharacterise','recharacterize',
  'mathy','crocodylomorph','conceiver','melancholiac','paidia','ilinx','ludus']);

const GOOD_POS = new Set(['noun','verb','adj','adjective','adv','adverb','det','determiner','pron','pronoun',
  'prep','preposition','conj','conjunction','num','numeral','particle','interjection','intj','contraction']);
const POS_LABEL = { noun: 'n.', verb: 'v.', adj: 'adj.', adjective: 'adj.', adv: 'adv.', adverb: 'adv.',
  det: 'det.', determiner: 'det.', pron: 'pron.', pronoun: 'pron.', prep: 'prep.', preposition: 'prep.',
  conj: 'conj.', conjunction: 'conj.', num: 'num.', numeral: 'num.', particle: 'part.',
  interjection: 'int.', intj: 'int.', contraction: 'contr.' };
const BAD_TAGS = new Set(['obsolete','archaic','rare','misspelling','nonstandard','deprecated','dated','alternative-form-of']);
const HEAD_RE = /^[a-z][a-z'-]*$/;
const FLEX_RE = /^[a-z][a-z'-]*$/;
const INFLECT_TAGS = new Set(['plural','third-person','singular','present','participle','past','comparative','superlative','simple']);
const BAD_FORM_TAGS = new Set(['alternative','obsolete','misspelling','nonstandard','archaic','rare','dated','pronunciation-spelling']);

// IPA 抽取（v0.2 放宽）：旧白名单缺 ː（长音 U+02D0）、组合附加符（U+0300–036F）、
// 鼻化/半元音附加符等，导致 /ˌæbsəˈfʌkɪŋluːtli/ 这类正常音标整体被拒。
// 新口径：允许拉丁字母 + IPA 扩展区 + 修饰字母区 + 组合符 + 少量标点；
//         但必须含真正的音标核心符号，防止把纯英文拼写/数字/模板垃圾当音标。
const IPA_OK = /^[\sa-zæðŋθ()/.\-'ʲʷⁿɚɝɹɫʔʍʁʀʕħʢʡǀǁǂǃʉɨɐʉ\u0250-\u02af\u02b0-\u02ff\u0300-\u036f]+$/i;
const IPA_CORE = /[æɑɒɔəɛɜɪʊʌθðʃʒŋɚɝɹɫːˈˌʔʍ\u0250-\u02af\u0300-\u036f]/;
function pickIpa(snd) {
  const raw0 = String((snd && snd.ipa) || '').trim();
  if (!raw0) return '';
  const raw = raw0.replace(/^[\/\[]+/, '').replace(/[\]\/]+$/, '').trim();
  if (!raw || !IPA_OK.test(raw) || !IPA_CORE.test(raw)) return '';
  return raw;
}
function accentScore(tags) {
  const j = [...tags].join(' ');
  if (tags.has('General-American') || /General-American|(^|\W)US($|\W)|(^|\W)GA($|\W)/.test(j)) return 2;
  if (tags.has('Received-Pronunciation') || /Received-Pronunciation|(^|\W)UK($|\W)|(^|\W)RP($|\W)/.test(j)) return 1;
  return 0;
}

function cleanGloss(s) {
  let g = (s.glosses || []).join('; ').replace(/\s+/g, ' ').trim();
  g = g.replace(/^[“"']|[”"']$/g, '').trim();
  return g;
}
function senseTags(s) { return new Set([...(s.tags || []), ...(s.raw_tags || [])]); }
function isCleanSense(s) {
  const t = senseTags(s);
  for (const x of t) if (BAD_TAGS.has(x)) return false;
  return !!cleanGloss(s);
}
function stdTmpl(o) {
  return (o.head_templates || []).some(t => /^en-(noun|verb|adj|adv|adjective|adverb|det|pron|prep|conj|numeral|contraction)$/.test(t.name || ''));
}

(async () => {
  // L0
  const dict = new DatabaseSync(path.join(ROOT, 'data', 'dict.sqlite'), { readOnly: true });
  const dictWords = new Set(dict.prepare('SELECT word FROM words').all().map(r => r.word.toLowerCase()));
  dict.close();

  // 频度排名
  const rank = new Map();
  for (const [i, line] of fs.readFileSync(path.join(SPIKE, 'en_full.txt'), 'utf8').split(/\r?\n/).entries()) {
    const w = line.split(/\s+/)[0]?.toLowerCase();
    if (w && !rank.has(w)) rank.set(w, i + 1);
  }

  /** @type {Map<string, any>} */
  const agg = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(SPIKE, 'en.jsonl.gz')).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  let lines = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    lines++;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.lang_code !== 'en') continue;
    const low = (o.word || '').trim().toLowerCase();
    if (!HEAD_RE.test(low)) continue;
    const inDict = dictWords.has(low);
    // 需求词即使 ECDICT 已收录（frq=0）也要聚合 forms 生成 lemma 行；其余 L0 已有的直接跳过
    if (inDict && !DEMAND.has(low)) continue;
    const pos = (o.pos || '').toLowerCase();
    if (!GOOD_POS.has(pos)) continue;
    let cleanSenses = (o.senses || []).filter(isCleanSense);
    // 需求词放宽：英式 alt-of（UK/nonstandard 标签）是用户语料里的真实拼写，接纳；只排除纯误拼/废弃
    if (!cleanSenses.length && DEMAND.has(low)) {
      cleanSenses = (o.senses || []).filter((s) => {
        const t = senseTags(s);
        if (t.has('misspelling') || t.has('obsolete') || t.has('archaic')) return false;
        return !!cleanGloss(s);
      });
    }
    if (!cleanSenses.length) continue;
    let rec = agg.get(low);
    if (!rec) { rec = { word: low, lines: [], forms: new Map(), ipa: '', r: rank.get(low) || 0, demand: DEMAND.has(low), inDict }; agg.set(low, rec); }
    const glosses = [];
    for (const s of cleanSenses.slice(0, 2)) {
      const g = cleanGloss(s);
      if (g && !glosses.includes(g)) glosses.push(g);
      if (glosses.length >= 2) break;
    }
    rec.lines.push({ pos, label: POS_LABEL[pos] || pos + '.', glosses, tmpl: stdTmpl(o) });
    if (!rec.ipa) {
      // 词级 sounds 为主；缺失时回退义项级 sounds（部分条目发音挂在 sense 下）
      const soundSrc = (o.sounds && o.sounds.length)
        ? o.sounds
        : (o.senses || []).flatMap((sx) => sx.sounds || []);
      const cands = [];
      for (const snd of soundSrc) {
        const ipa = pickIpa(snd);
        if (ipa) cands.push({ ipa, tags: new Set([...(snd.tags || []), ...(snd.raw_tags || [])]) });
      }
      if (cands.length) {
        cands.sort((a, b) => accentScore(b.tags) - accentScore(a.tags));
        rec.ipa = cands[0].ipa;
      }
    }
    for (const f of o.forms || []) {
      const fl = (f.form || '').toLowerCase().trim();
      if (!FLEX_RE.test(fl) || fl === low || fl.length < 3 || dictWords.has(fl)) continue;
      const tags = new Set(f.tags || []);
      let bad = false; for (const t of tags) if (BAD_FORM_TAGS.has(t)) { bad = true; break; }
      if (bad) continue;
      let infl = false; for (const t of tags) if (INFLECT_TAGS.has(t)) { infl = true; break; }
      if (!infl) continue;
      if (!rec.forms.has(fl)) rec.forms.set(fl, [...tags]);
    }
  }

  // 选词 + 组装
  const words = [];
  const selectedRecs = [];
  let demandFound = 0; const demandMiss = new Set(DEMAND);
  for (const rec of agg.values()) {
    const templated = rec.lines.some(l => l.tmpl);
    const selected = rec.demand || (rec.r && rec.r <= RANK_MAX && templated);
    if (!selected) continue;
    if (rec.demand) { demandFound++; demandMiss.delete(rec.word); }
    rec._selected = true;
    selectedRecs.push(rec);
    if (rec.inDict) continue; // L0 已有的需求词只贡献 lemma 屈折映射，不重复出词头
    const parts = [];
    const seenPos = new Set();
    for (const l of rec.lines) {
      if (seenPos.has(l.label)) continue;
      seenPos.add(l.label);
      const g = l.glosses.join('; ');
      if (g) parts.push(`${l.label} ${g}`);
      if (parts.length >= 3) break;
    }
    // 每个词性一行（\n），与 ECDICT translation 多义项分隔一致，前端可按行选义项
    const definition = parts.join('\n').slice(0, 400);
    if (!definition) continue;
    const posSet = [...new Set(rec.lines.map(l => l.label))].join('/');
    words.push({ word: rec.word, phonetic: rec.ipa || '', pos: posSet, definition });
  }
  words.sort((a, b) => a.word.localeCompare(b.word));

  // lemma 行（为所有入选词头，含 L0 已有但缺屈折映射的需求词）
  const lemmaRows = [];
  const seenFlex = new Set();
  for (const rec of selectedRecs) {
    for (const fl of rec.forms.keys()) {
      if (seenFlex.has(fl)) continue;
      seenFlex.add(fl);
      lemmaRows.push([fl, rec.word]);
    }
  }
  lemmaRows.sort((a, b) => a[0].localeCompare(b[0]));

  // 写 staging
  fs.mkdirSync(OUT_DIR, { recursive: true });
  try { fs.rmSync(STAGE, { recursive: true, force: true }); } catch { /* ignore */ }
  const db = new DatabaseSync(STAGE);
  db.exec(`
CREATE TABLE words(word TEXT PRIMARY KEY, phonetic TEXT, pos TEXT, translation TEXT, definition TEXT, tag TEXT, bnc INTEGER, frq INTEGER);
CREATE TABLE mwe(phrase TEXT PRIMARY KEY, translation TEXT, pos TEXT, tag TEXT);
CREATE TABLE lemma(flexion TEXT PRIMARY KEY, lemma TEXT);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
`);
  const insW = db.prepare("INSERT INTO words(word,phonetic,pos,translation,definition,tag,bnc,frq) VALUES(?,?,?,'',?, 'wikt-en',0,0)");
  const tx = db.prepare('INSERT INTO lemma VALUES(?,?)');
  for (const w of words) insW.run(w.word, w.phonetic, w.pos, w.definition);
  for (const [f, l] of lemmaRows) tx.run(f, l);
  const meta = {
    id: 'wikt-en',
    name: 'Wiktionary 英语扩展词包',
    version: '0.2.0',
    license: 'CC-BY-SA-4.0（词条与释义来自 Wiktionary，经 wiktextract/kaikki.org 转储；选词使用 FrequencyWords/OpenSubtitles 频度表，同为 CC-BY-SA-4.0）',
    source: 'Wiktionary (https://www.wiktionary.org) via wiktextract kaikki.org-dictionary-English.jsonl.gz, downloaded 2026-09-21；frequency gate hermitdave/FrequencyWords content/2018/en/en_full.txt rank<=200000；builder pack-build/wikt-en/build-pack.cjs',
    built_at: new Date().toISOString(),
    selection: `ECDICT 缺失的小写通用词；标准 en-* head_tmpl；干净义项；rank<=${RANK_MAX} 或需求词清单；共 ${words.length} 词，${lemmaRows.length} 屈折映射`,
  };
  const insMeta = db.prepare('INSERT INTO meta VALUES(?,?)');
  for (const [k, v] of Object.entries(meta)) insMeta.run(k, v);
  db.close();
  fs.renameSync(STAGE, OUT);

  console.log(`扫描行 ${lines.toLocaleString()}，聚合词头 ${agg.size.toLocaleString()}`);
  console.log(`已生成 ${path.relative(process.cwd(), OUT)}`);
  console.log(`words=${words.length}，lemma=${lemmaRows.length}`);
  console.log(`需求词命中 ${demandFound}/${DEMAND.size}，缺失: ${[...demandMiss].join(', ') || '无'}`);
  const sz = fs.statSync(OUT).size;
  console.log(`包体积 ${(sz / 1048576).toFixed(1)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
