// 审计修复-1：relatedWords（同根/近义）与 meaningChoices（干扰项）重写
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const txt = fs.readFileSync(path.join(__dirname, "audit-related-v2.txt"), "utf8").replace(/\s+$/, "");
const relNew = txt.slice(0, txt.indexOf("  // 四选一干扰项")).replace(/\s+$/, "");
const mcNew = txt.slice(txt.indexOf("  // 四选一干扰项")).replace(/\s+$/, "");

// --- relatedWords 替换 ---
const r0 = s.indexOf("  // 同根/派生词：AWL 权威词族");
const r1 = s.indexOf("    return { family, synonyms };\n  }");
if (r0 < 0 || r1 < 0) throw new Error("relatedWords 定位失败");
s = s.slice(0, r0) + relNew + s.slice(r1 + "    return { family, synonyms };\n  }".length);

// --- meaningChoices 替换 ---
const m0 = s.indexOf("  meaningChoices(correct, lemma) {");
const mEnd = "    return choices;\n  }";
const m1 = s.indexOf(mEnd, m0);
if (m0 < 0 || m1 < 0) throw new Error("meaningChoices 定位失败");
s = s.slice(0, m0) + mcNew + s.slice(m1 + mEnd.length);

fs.writeFileSync(fp, s, "utf8");
console.log("both replaced");
