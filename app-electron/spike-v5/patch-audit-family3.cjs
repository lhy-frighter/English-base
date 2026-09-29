// 补注入 exchangeZeroBase 方法（patch-audit-family2 第 4 锚点失败的补丁）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const anchor = `    this._inflCache.set(key, isInfl);
    return isInfl;
  }
`;
const add = `
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
  }
`;
if (s.includes("exchangeZeroBase(w)")) { console.log("already present"); process.exit(0); }
if (!s.includes(anchor)) throw new Error("anchor missing");
s = s.replace(anchor, anchor + add);
fs.writeFileSync(fp, s, "utf8");
console.log("inserted");
