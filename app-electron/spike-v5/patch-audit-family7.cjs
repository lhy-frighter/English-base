// 审计修复-7：规则②门控改为"常用 或 候选自身 exchange 声明 0:本词"（started/became 保留，birded/frenches 剔除）
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
`      const r = this.user.prepare("SELECT word,pos,translation,frq,tag FROM dict.words WHERE word=?").get(w);
      if (!r) return;
      // exchange 屈折来源同样要求常用度门控，剔除 frenches/hering/birded 类零频动词化/脏数据
      if (opts.common && !(Number(r.frq) > 0 || (r.tag || ""))) return;`,
`      const r = this.user.prepare("SELECT word,pos,translation,frq,tag,exchange FROM dict.words WHERE word=?").get(w);
      if (!r) return;
      // exchange 屈折来源门控：常用词直接收；零频候选必须在自身 exchange 里声明 0:<本词>
      // （started/became/happier 保留；partied/birded/frenches/lowing 这类空声明零频动词化剔除）
      if (opts.inflection) {
        const declares = (r.exchange || "").match(/(?:^|\\/)0:([^/]+)/);
        const common = Number(r.frq) > 0 || (r.tag || "");
        if (!common && !(declares && declares[1].toLowerCase() === low)) return;
      }`,
"门控升级");

rep(
`        v.split(",").forEach((x) => pushWord(x, { common: true }));`,
`        v.split(",").forEach((x) => pushWord(x, { inflection: true }));`,
"调用点");

fs.writeFileSync(fp, s, "utf8");
console.log("saved");
