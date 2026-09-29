// 1) feeds.cjs：选可成卡词（功能词现在被拦截）
const fs = require("fs");
let f = fs.readFileSync("test/feeds.cjs", "utf8");
const oldTok = `  const w = toks[Math.floor(toks.length / 2)];
  core.createStandaloneNote({ word: w.text, label: w.label, phrase: w.phrase, sense: "" });`;
const newTok = `  const w = toks.find((t) => {
    const e = core.lookup(t.text, t.label, t.phrase ?? null, null);
    return e && e.cardable !== false;
  });
  assert.ok(w, "摘要中应至少有一个可成卡普通词");
  core.createStandaloneNote({ word: w.text, label: w.label, phrase: w.phrase, sense: "" });`;
if (!f.includes(oldTok)) { console.error("feeds anchor missing"); process.exit(1); }
f = f.replace(oldTok, newTok);
fs.writeFileSync("test/feeds.cjs", f, "utf8");
console.log("feeds.cjs fixed");

// 2) s11-recycle.cjs：追加功能词不建卡断言
let t = fs.readFileSync("test/s11-recycle.cjs", "utf8");
const anchor = `core.user.close();
fs.rmSync(dir, { recursive: true, force: true });`;
const add = `// 11. 功能词永不建卡：lookup 标 cardable:false，三个 create 入口抛错
const theEntry = core.lookup("the", "word", null, null);
check("lookup(the) 标记为不可建卡", !!theEntry && theEntry.cardable === false && theEntry.kind === "function");
let threwThe = false;
try { core.createStandaloneNote({ word: "the", label: "word", phrase: false, sense: "" }); }
catch (e) { threwThe = /功能词/.test(String(e.message)); }
check("createStandaloneNote 拒绝功能词", threwThe);
let threwOf = false;
try { core.createNote({ word: "of", label: "word", phrase: false, sense: "", textId: a1.text_id, offset: 0 }); }
catch (e) { threwOf = /功能词/.test(String(e.message)); }
check("createNote 拒绝功能词", threwOf);
const lexCountAfter = core.user.prepare("SELECT COUNT(*) n FROM lexemes WHERE lemma IN ('the','of')").get().n;
check("拒绝后词元零污染", lexCountAfter === 0);

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });`;
if (!t.includes(anchor)) { console.error("recycle anchor missing"); process.exit(1); }
t = t.replace(anchor, add);
fs.writeFileSync("test/s11-recycle.cjs", t, "utf8");
console.log("s11-recycle.cjs extended");
