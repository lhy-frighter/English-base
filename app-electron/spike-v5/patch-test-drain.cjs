const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/test/tts-chunks.ts";
let s = fs.readFileSync(p, "utf8");

const impOld = `import { splitClauses, splitSentences, planKokoroChunks, maskProtected, unmask, pauseAfter } from "../src/tts-chunks.ts";`;
const impNew = `import { splitClauses, splitSentences, planKokoroChunks, maskProtected, unmask, pauseAfter, drainSentences } from "../src/tts-chunks.ts";`;
if (!s.includes(impOld)) throw new Error("import anchor missing");
s = s.replace(impOld, impNew);

const anchor = `check("播放:空输入零块", planKokoroChunks("").length === 0);
`;
if (!s.includes(anchor)) throw new Error("end anchor missing");
const add = `// drainSentences 流式抽句
{
  const r = drainSentences("Hello there.");
  check("抽句:完整句就绪", r.ready.length === 1 && r.ready[0] === "Hello there." && r.rest === "", JSON.stringify(r));
}
{
  const r = drainSentences("Hello there. How are");
  check("抽句:末段残余", r.ready.length === 1 && r.ready[0] === "Hello there." && r.rest === "How are", JSON.stringify(r));
}
{
  const r = drainSentences("First. Second. Third");
  check("抽句:多句一次抽出", r.ready.length === 2 && r.ready[1] === "Second." && r.rest === "Third", JSON.stringify(r));
}
{
  const r = drainSentences("Dr. Smith arrived. He left.");
  check("抽句:缩写不误断", r.ready.length === 2 && r.ready[0] === "Dr. Smith arrived.", JSON.stringify(r));
}
{
  const r = drainSentences("Line one\\nLine two");
  check("抽句:换行断句", r.ready.length === 1 && r.ready[0] === "Line one" && r.rest === "Line two", JSON.stringify(r));
}
{
  const r = drainSentences("not done yet");
  check("抽句:无边界全残余", r.ready.length === 0 && r.rest === "not done yet", JSON.stringify(r));
}
`;
s = s.replace(anchor, add + anchor);
fs.writeFileSync(p, s);
console.log("drainSentences tests added");
