// 审计修复-6b：重放前三处替换（family2 因第 4 锚点失败未写盘）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

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

fs.writeFileSync(fp, s, "utf8");
console.log("saved");
