// S11-a 顺手修：relatedWords 同根词去前缀噪声（the→theban 类假同根）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const startMark = "  relatedWords(lemma) {";
const endMark = "    return { family, synonyms };\n  }";
const i0 = s.indexOf(startMark);
const i1 = s.indexOf(endMark);
if (i0 < 0 || i1 < 0) throw new Error("relatedWords 定位失败");
const block = fs.readFileSync(path.join(__dirname, "s11a-related.txt"), "utf8").replace(/\s+$/, "");
s = s.slice(0, i0) + block + s.slice(i1 + endMark.length);
fs.writeFileSync(fp, s, "utf8");
console.log("relatedWords replaced");
