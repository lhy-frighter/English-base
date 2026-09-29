const fs = require("fs");
const fp = "test/wikt-pack.cjs";
let s = fs.readFileSync(fp, "utf8");
const anchor = `check("词包规模合理（words 1k–20k）", n.w > 1000 && n.w < 20000, \`\${n.w} words / \${n.l} lemma\`);`;
const add = anchor + `
const ipa = pdb.prepare("SELECT COUNT(*) n FROM words WHERE phonetic!=''").get().n;
check("IPA 覆盖 ≥1000（builder v0.2 放宽抽取）", ipa >= 1000, ipa + " / " + n.w);
const abso = pdb.prepare("SELECT phonetic FROM words WHERE word='abso-fucking-lutely'").get();
check("长音符号 ː 不再被误拒", !!abso && abso.phonetic.includes("ː"), abso && abso.phonetic);`;
if (s.includes("IPA 覆盖 ≥1000")) { console.log("already"); process.exit(0); }
if (!s.includes(anchor)) throw new Error("anchor missing");
s = s.replace(anchor, add);
fs.writeFileSync(fp, s, "utf8");
console.log("test assertions added");
