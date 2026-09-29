const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/test/tts-chunks.ts";
let s = fs.readFileSync(p, "utf8");

const old1 = `{
  const cs = planKokoroChunks("However, this is hard.");
  // splitClauses 在逗号处切：首块 "However," 1 词，无需再切
  check("播放:短首块不硬切", cs[0].text === "However,", cs[0].text);
}`;
const new1 = `{
  // 短句（≤6 词）整块一次性合成，句内逗号的停顿/语调完全交给模型
  const cs = planKokoroChunks("However, this is hard.");
  check("播放:短句整块合成", cs.length === 1 && cs[0].text === "However, this is hard." && cs[0].seamless === undefined, JSON.stringify(cs));
}`;
if (!s.includes(old1)) throw new Error("short block anchor missing");
s = s.replace(old1, new1);

const old2 = `{
  const cs = planKokoroChunks("I went home. She stayed.");
  check("播放:两句两块", cs.length === 2, JSON.stringify(cs.map((c) => c.text)));
  check("播放:句间停顿260", cs[0].pause === 260, String(cs[0].pause));
}`;
const new2 = `{
  // 多句也整块合成：模型按全句语境自然处理句间断句与语调；句间补短间隙由播放层负责
  const cs = planKokoroChunks("I went home. She stayed.");
  check("播放:多句整块自然断句", cs.length === 1 && cs[0].text === "I went home. She stayed.", JSON.stringify(cs.map((c) => c.text)));
}`;
if (!s.includes(old2)) throw new Error("two-sentence anchor missing");
s = s.replace(old2, new2);

fs.writeFileSync(p, s);
console.log("human-rhythm tests updated");
