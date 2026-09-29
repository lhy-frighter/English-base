// 审计修复-2：extractSentence 缩写/小数/首字母缩写保护（与 tts-chunks 同规则）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const oldBlock = `function extractSentence(text, offset) {
  let start = Math.min(offset, text.length);
  while (start > 0) {
    const b = text[start - 1];
    if (b === "." || b === "!" || b === "?" || b === "\\n") break;
    start--;
  }
  let end = Math.min(offset, text.length);
  while (end < text.length) {
    const b = text[end];
    if (b === "." || b === "!" || b === "?" || b === "\\n") { end++; break; }
    end++;
  }
  return text.slice(start, end).trim();
}`;
const newBlock = `// 句点保护：缩写（Dr./etc./Fig.）、连续首字母（U.S./e.g.）、小数（3.14）里的句点替换为占位符，等长不破坏索引
function maskSentenceDots(text) {
  return text
    .replace(/\\d\\.\\d/g, (m) => m[0] + "\\u0001" + m[2])
    .replace(/(?:[A-Za-z]\\.){2,}/g, (m) => m.replace(/\\./g, "\\u0001"))
    .replace(/\\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc|cf|al|No|Vol|Fig|Inc|Ltd|Eds?|pp?)\\./g, (m) => m.replace(/\\.$/, "\\u0001"));
}
function extractSentence(text, offset) {
  const masked = maskSentenceDots(text);
  let start = Math.min(offset, text.length);
  while (start > 0) {
    const b = masked[start - 1];
    if (b === "." || b === "!" || b === "?" || b === "\\n") break;
    start--;
  }
  let end = Math.min(offset, text.length);
  while (end < text.length) {
    const b = masked[end];
    if (b === "." || b === "!" || b === "?" || b === "\\n") { end++; break; }
    end++;
  }
  return text.slice(start, end).trim();
}`;
if (s.includes("maskSentenceDots")) { console.log("skip"); }
else {
  if (!s.includes(oldBlock)) throw new Error("extractSentence 锚点缺失");
  s = s.replace(oldBlock, newBlock);
  fs.writeFileSync(fp, s, "utf8");
  console.log("patched extractSentence");
}
