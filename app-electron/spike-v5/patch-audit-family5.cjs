// 审计修复-6c：canonical 中 exBase 优先于 lemma 映射（修 bustier→bustiers 反向垃圾）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const oldStr = `    const mapped = this.lemmaOf.get(low);
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
    if (mapped && this.words.has(mapped)) return mapped;`;
const newStr = `    const mapped = this.lemmaOf.get(low);
    // 词头自身 exchange 的 0:base 最权威（也能避开 lemma 表反向垃圾，如 bustier→bustiers）
    const exBase = this.exchangeZeroBase(low);
    if (exBase && exBase !== low && this.words.has(exBase)) {
      const a = Number(this.user.prepare("SELECT frq FROM dict.words WHERE word=?").get(low)?.frq) || 0;
      const b = Number(this.user.prepare("SELECT frq FROM dict.words WHERE word=?").get(exBase)?.frq) || 0;
      if (a === 0 || (b > 0 && b < a)) return exBase;
    }
    if (mapped && mapped !== low && this.words.has(mapped) && this.isInflectedHead(low, mapped)) return mapped;
    if (this.words.has(low)) return low;
    if (mapped && this.words.has(mapped)) return mapped;`;
if (!s.includes(oldStr)) throw new Error("canonical 锚点缺失");
s = s.replace(oldStr, newStr);
fs.writeFileSync(fp, s, "utf8");
console.log("ok");
