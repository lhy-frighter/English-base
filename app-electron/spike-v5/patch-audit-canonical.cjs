// 审计修复-4：canonical 优先把零频屈折词头还原到高频原形；相遇表启动时合并
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}

// 1) canonical：零频屈折词头（ECDICT 为复数/屈折形式建的 frq=0 条目）优先还原
rep(
`  canonical(low0) {
    const low = normApos(low0);
    if (this.words.has(low)) return low;
    const nt = NT_EXPAND.get(low);
    if (nt && this.words.has(nt)) return nt;
    const ap = low.lastIndexOf("'");
    if (ap > 0 && CONTRACTIONS.has(low.slice(ap + 1))) {
      const left = low.slice(0, ap);
      if (this.words.has(left)) return left;
    }
    const lem = this.lemmaOf.get(low);
    if (lem && this.words.has(lem)) return lem;
    if (!/['-]/.test(low)) return this.ruleLemma(low);
    return null;
  }`,
`  canonical(low0) {
    const low = normApos(low0);
    const nt = NT_EXPAND.get(low);
    if (nt && this.words.has(nt)) return nt;
    const ap = low.lastIndexOf("'");
    if (ap > 0 && CONTRACTIONS.has(low.slice(ap + 1))) {
      const left = low.slice(0, ap);
      if (this.words.has(left)) return left;
    }
    // ECDICT 为屈折形式也建了 frq=0 词头（如 investigators 的 exchange 为 0:investigator/1:s），
    // 不能因为词头存在就直接返回表层形：零频屈折词头优先还原到 lemma 表指向的原形，
    // 避免单复数分裂成两个词元、已学复数判不出来、漏网词计数分散。
    const mapped = this.lemmaOf.get(low);
    if (mapped && mapped !== low && this.words.has(mapped) && this.zeroFreqHead(low)) return mapped;
    if (this.words.has(low)) return low;
    if (mapped && this.words.has(mapped)) return mapped;
    if (!/['-]/.test(low)) return this.ruleLemma(low);
    return null;
  }

  // 该词头是否为 ECDICT 的零频屈折条目（frq 为空/0）；高频词头（people/data 等）保持自身为原形
  zeroFreqHead(w) {
    if (!this._zeroFreqCache) this._zeroFreqCache = new Map();
    if (this._zeroFreqCache.has(w)) return this._zeroFreqCache.get(w);
    const alias = this.words.get(w);
    const row = alias ? this.lookupWordRow(alias, w) : null;
    const isZero = !row || !(Number(row.frq) > 0);
    this._zeroFreqCache.set(w, isZero);
    return isZero;
  }`,
"canonical 还原");

// 2) 相遇表词元合并（构造函数中 prune 之后）
rep(
`    this.backfillUnknownEncounters();
    this.pruneFunctionEncounters();`,
`    this.backfillUnknownEncounters();
    this.pruneFunctionEncounters();
    this.consolidateEncounterLemmas();`,
"构造调用合并");

rep(
`  recordUnknownEncounters(textId, tokens) {`,
`  // 一次性合并：旧版按表层形记录的复数/屈折相遇归并到原形（同文计数相加）
  consolidateEncounterLemmas() {
    if (this.user.prepare("SELECT 1 FROM app_settings WHERE k='encounters_consolidated_v1'").get()) return;
    const rows = this.user.prepare("SELECT lemma,text_id,count,first_seen_at,last_seen_at FROM unknown_encounters").all();
    const merged = new Map();
    for (const r of rows) {
      const lem = this.canonical(r.lemma) || r.lemma;
      const key = lem + "|" + r.text_id;
      const cur = merged.get(key);
      if (!cur) merged.set(key, { lemma: lem, text_id: r.text_id, count: r.count, f: r.first_seen_at, l: r.last_seen_at });
      else { cur.count += r.count; cur.f = Math.min(cur.f, r.first_seen_at); cur.l = Math.max(cur.l, r.last_seen_at); }
    }
    const up = this.user.prepare(\`INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(lemma,text_id) DO UPDATE SET count=excluded.count,
        first_seen_at=MIN(first_seen_at,excluded.first_seen_at), last_seen_at=MAX(last_seen_at,excluded.last_seen_at)\`);
    let changed = 0;
    for (const m of merged.values()) {
      const before = this.user.prepare("SELECT COUNT(*) n FROM unknown_encounters WHERE lemma=? AND text_id=?",
      ).get(m.lemma, m.text_id).n;
      up.run(m.lemma, m.text_id, m.count, m.f, m.l);
      if (!before) changed++;
    }
    // 删除仍以屈折形为键的旧行（其原形不同）
    for (const r of rows) {
      const lem = this.canonical(r.lemma) || r.lemma;
      if (lem !== r.lemma) this.user.prepare("DELETE FROM unknown_encounters WHERE lemma=? AND text_id=?").run(r.lemma, r.text_id);
    }
    this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('encounters_consolidated_v1',?)").run(String(changed));
  }

  recordUnknownEncounters(textId, tokens) {`,
"相遇合并方法");

fs.writeFileSync(fp, s, "utf8");
console.log("完成", n);
