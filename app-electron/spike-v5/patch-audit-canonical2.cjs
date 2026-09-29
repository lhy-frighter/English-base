// 审计修复-4b：canonical 还原闸门从“零频”升级为“零频 或 exchange 0:base 屈折标记”
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const oldCall = `    const mapped = this.lemmaOf.get(low);
    if (mapped && mapped !== low && this.words.has(mapped) && this.zeroFreqHead(low)) return mapped;`;
const newCall = `    const mapped = this.lemmaOf.get(low);
    if (mapped && mapped !== low && this.words.has(mapped) && this.isInflectedHead(low, mapped)) return mapped;`;
if (!s.includes(oldCall)) throw new Error("canonical 调用锚点缺失");
s = s.replace(oldCall, newCall);

const oldMethod = `  // 该词头是否为 ECDICT 的零频屈折条目（frq 为空/0）；高频词头（people/data 等）保持自身为原形
  zeroFreqHead(w) {
    if (!this._zeroFreqCache) this._zeroFreqCache = new Map();
    if (this._zeroFreqCache.has(w)) return this._zeroFreqCache.get(w);
    const alias = this.words.get(w);
    const row = alias ? this.lookupWordRow(alias, w) : null;
    const isZero = !row || !(Number(row.frq) > 0);
    this._zeroFreqCache.set(w, isZero);
    return isZero;
  }`;
const newMethod = `  // 该词头是否应视为屈折形式：① frq 为空/0 的屈折条目（investigators）；
  // ② exchange 带 0:<base>/1:<码> 屈折标记（quicker/studying，即使高频也还原；people/data 无标记则保持自身）
  isInflectedHead(w, base) {
    if (!this._inflCache) this._inflCache = new Map();
    const key = w + ">" + base;
    if (this._inflCache.has(key)) return this._inflCache.get(key);
    const alias = this.words.get(w);
    const row = alias ? this.lookupWordRow(alias, w) : null;
    let isInfl = !row || !(Number(row.frq) > 0);
    if (!isInfl) {
      const ex = this.user.prepare("SELECT exchange FROM dict.words WHERE word=?").get(w)?.exchange || "";
      const m0 = ex.match(/(?:^|\\/)0:([^/]+)/);
      isInfl = !!(m0 && m0[1].toLowerCase() === base);
    }
    this._inflCache.set(key, isInfl);
    return isInfl;
  }`;
if (!s.includes(oldMethod)) throw new Error("zeroFreqHead 方法锚点缺失");
s = s.replace(oldMethod, newMethod);
fs.writeFileSync(fp, s, "utf8");
console.log("gate upgraded");
