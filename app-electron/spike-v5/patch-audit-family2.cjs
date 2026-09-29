// 审计修复-6：relatedWords 规则②功能词跳过+常用度门控+连字符过滤；canonical exchange 0:base 回退
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

// 1) pushWord 全局过滤连字符
rep(
`    const pushWord = (wIn) => {
      const w = String(wIn || "").toLowerCase().trim();
      if (!w || w === low || map.has(w)) return;
      const r = this.user.prepare("SELECT word,pos,translation FROM dict.words WHERE word=?").get(w);
      if (!r) return;`,
`    const pushWord = (wIn, opts = {}) => {
      const w = String(wIn || "").toLowerCase().trim();
      if (!w || w === low || map.has(w) || w.includes("-")) return;
      const r = this.user.prepare("SELECT word,pos,translation,frq,tag FROM dict.words WHERE word=?").get(w);
      if (!r) return;
      // exchange 屈折来源同样要求常用度门控，剔除 frenches/hering/birded 类零频动词化/脏数据
      if (opts.common && !(Number(r.frq) > 0 || (r.tag || ""))) return;`,
"pushWord 门控");

// 2) 规则②：功能词整体跳过；候选走 common 门控
rep(
`    const self = this.user.prepare("SELECT exchange FROM dict.words WHERE word=?").get(low);
    if (self && self.exchange) {
      for (const item of self.exchange.split("/")) {
        if (!item.includes(":")) continue;
        const [code, v] = item.split(":", 2);
        if (!EXCHANGE_CODES.has(code) || !v) continue;
        v.split(",").forEach(pushWord);
      }
    }`,
`    const self = this.user.prepare("SELECT exchange FROM dict.words WHERE word=?").get(low);
    if (self && self.exchange && !this.isFunctionLemma(low)) {
      for (const item of self.exchange.split("/")) {
        if (!item.includes(":")) continue;
        const [code, v] = item.split(":", 2);
        if (!EXCHANGE_CODES.has(code) || !v) continue;
        v.split(",").forEach((x) => pushWord(x, { common: true }));
      }
    }`,
"规则二门控");

// 3) canonical：词头自带 exchange 0:base 时的回退还原
rep(
`    const mapped = this.lemmaOf.get(low);
    if (mapped && mapped !== low && this.words.has(mapped) && this.isInflectedHead(low, mapped)) return mapped;
    if (this.words.has(low)) return low;
    if (mapped && this.words.has(mapped)) return mapped;`,
`    const mapped = this.lemmaOf.get(low);
    if (mapped && mapped !== low && this.words.has(mapped) && this.isInflectedHead(low, mapped)) return mapped;
    if (this.words.has(low)) {
      // lemma 表缺失或反向指向时（denied/qualified/varied），用词头自身 exchange 的 0:base 还原：
      // 表层零频直接还原；表层高频时仅当原形明显更常用（frq 排名更小）
      const exBase = this.exchangeZeroBase(low);
      if (exBase && exBase !== low && this.words.has(exBase)) {
        const a = Number(this.user.prepare("SELECT frq FROM dict.words WHERE word=?").get(low)?.frq) || 0;
        const b = Number(this.user.prepare("SELECT frq FROM dict.words WHERE word=?").get(exBase)?.frq) || 0;
        if (a === 0 || (b > 0 && b < a)) return exBase;
      }
      return low;
    }
    if (mapped && this.words.has(mapped)) return mapped;`,
"canonical exBase 回退");

// 4) exchangeZeroBase 辅助方法（放在 isInflectedHead 后）
rep(
`          isInfl = !!(m0 && m0[1].toLowerCase() === base);
    }
    this._inflCache.set(key, isInfl);
    return isInfl;
  }`,
`          isInfl = !!(m0 && m0[1].toLowerCase() === base);
    }
    this._inflCache.set(key, isInfl);
    return isInfl;
  }

  // 词头自身 exchange 声明的 0:<base> 原形（缓存）
  exchangeZeroBase(w) {
    if (!this._exBaseCache) this._exBaseCache = new Map();
    if (this._exBaseCache.has(w)) return this._exBaseCache.get(w);
    let base = null;
    const r = this.user.prepare("SELECT exchange FROM dict.words WHERE word=?").get(w);
    if (r && r.exchange) {
      const m0 = r.exchange.match(/(?:^|\\/)0:([^/]+)/);
      if (m0) base = m0[1].toLowerCase();
    }
    this._exBaseCache.set(w, base);
    return base;
  }`,
"exchangeZeroBase 方法");

fs.writeFileSync(fp, s, "utf8");
console.log("done");
