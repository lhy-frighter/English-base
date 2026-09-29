// 审计修复-3b：功能词表扩充（a/an 首义项无词性前缀；封闭类副词/代词/介词）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const oldBlock = `// 封闭类功能词/助动词：不进漏网词相遇表（the/of/and、be/do/have 助动词系列）
const AUX_WORDS = new Set(["be","is","are","was","were","been","am","being","do","does","did","done","doing",
  "have","has","had","having","will","would","shall","should","can","could","may","might","must","ought","need","dare","used"]);
const FUNCTION_POS_RE = /^\\s*(art|prep|conj|pron|det|int|interj|num|modal|aux|part|abbr)\\./i;`;
const words = [
  // 冠词/指示
  "a","an","the","this","that","these","those",
  // be/do/have 助动词系列
  "be","is","are","was","were","been","am","being","do","does","did","done","doing",
  "have","has","had","having","will","would","shall","should","can","could","may","might","must","ought","need","dare","used",
  // 代词/限定
  "i","me","my","mine","we","us","our","ours","you","your","yours","he","him","his","she","her","hers","it","its","they","them","their","theirs",
  "myself","yourself","himself","herself","itself","ourselves","yourselves","themselves","who","whom","whose","which","what",
  "everyone","everybody","everything","someone","somebody","something","anyone","anybody","anything","noone","nobody","nothing",
  "all","any","both","each","few","more","most","other","others","some","such","none","neither","either","every","several","many","much",
  // 介词/小品词
  "of","in","on","at","to","for","from","with","by","about","into","through","during","before","after","above","below","between","under",
  "over","across","along","around","behind","beside","among","amongst","upon","within","without","near","onto","off","up","down","out",
  "via","per","versus","amid","amidst","despite","except","till","until","toward","towards","against","throughout",
  // 连词
  "and","or","but","nor","so","yet","if","then","else","when","whenever","where","wherever","why","how","while","although","though",
  "because","since","unless","whether","as","than","once","whereas","nevertheless","nonetheless",
  // 封闭类副词/量化
  "not","no","now","then","here","there","always","never","often","sometimes","usually","rarely","seldom","ever",
  "very","too","also","just","only","even","still","already","again","almost","quite","rather","perhaps","maybe",
  "indeed","thus","therefore","however","moreover","furthermore","otherwise","likewise","instead","anyway",
];
const newBlock = `// 封闭类功能词：不进漏网词相遇表（冠词/代词/介词/连词/助动词/封闭副词）
const FUNCTION_WORDS = new Set(${JSON.stringify(words)});
const FUNCTION_POS_RE = /^\\s*(art|prep|conj|pron|det|int|interj|num|modal|aux|part|abbr)\\./i;`;
if (s.includes("const FUNCTION_WORDS")) console.log("skip");
else { if (!s.includes(oldBlock)) throw new Error("常量锚点缺失"); s = s.replace(oldBlock, newBlock); }
s = s.replace("if (AUX_WORDS.has(lem)) return true;", "if (FUNCTION_WORDS.has(lem)) return true;");
fs.writeFileSync(fp, s, "utf8");
console.log("function set size", words.length);
