const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "test", "s9-session.cjs");
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(a, b, label) {
  if (!s.includes(a)) throw new Error("anchor: " + label);
  s = s.replace(a, b); n++; console.log("patched", label);
}
rep("for Kaiser zzqxwibble today.", "for Quixilvar zzqxwibble today.");
rep('check("proper（Kaiser）不入表", !rows.some((r) => /kaiser/i.test(r.lemma)));',
    'check("proper（Quixilvar 生造专名）不入表", !rows.some((r) => /quixilvar/i.test(r.lemma)));');
rep('!!reopened.user.prepare("SELECT 1 FROM coverage_assessments WHERE text_id=?", a2.text_id).get());',
    '!!reopened.user.prepare("SELECT 1 FROM coverage_assessments WHERE text_id=?").get(a2.text_id));');
fs.writeFileSync(fp, s, "utf8");
console.log("done", n);
