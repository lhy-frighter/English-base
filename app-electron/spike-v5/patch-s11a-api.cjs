// S11-a：api.ts ReviewCard 加 text_id
const fs = require("fs");
const fp = "D:/vibe coding/英语学习/app-electron/src/api.ts";
let s = fs.readFileSync(fp, "utf8");
const oldStr = "  sentence: string;\n  full: string;\n  word: string;";
const newStr = "  sentence: string;\n  full: string;\n  text_id: number | null;\n  word: string;";
if (s.includes("text_id: number | null;\n  word: string;")) { console.log("skip"); }
else {
  if (!s.includes(oldStr)) throw new Error("锚点缺失");
  fs.writeFileSync(fp, s.replace(oldStr, newStr), "utf8");
  console.log("patched");
}
