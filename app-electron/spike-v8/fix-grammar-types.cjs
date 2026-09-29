const fs = require("node:fs");

// ① grammar-engine: postJson Promise<number> → Promise<string>
const ge = "D:/vibe coding/英语学习/app-electron/src/conversation/grammar-engine.ts";
let g = fs.readFileSync(ge, "utf8");
const oldSig = `async function postJson(
  url: string, key: string, model: string, messages: { role: string; content: string }[],
): Promise<number> {`;
const newSig = `async function postJson(
  url: string, key: string, model: string, messages: { role: string; content: string }[],
): Promise<string> {`;
if (g.indexOf(oldSig) === -1) { console.log("GE ANCHOR MISSING"); process.exit(2); }
g = g.split(oldSig).join(newSig);
fs.writeFileSync(ge, g);
console.log("grammar-engine fixed");

// ② App.tsx: show readGrammarMsg in strip
const ap = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let a = fs.readFileSync(ap, "utf8");
const oldBtn = `                <button className="ghost" onClick={() => { setSelTrans(null); setSelText(""); setReadGrammar(null); }}>关闭</button>
              </div>
            )}`;
const newBtn = `                <button className="ghost" onClick={() => { setSelTrans(null); setSelText(""); setReadGrammar(null); }}>关闭</button>
                {readGrammarMsg && <em className="err-text">{readGrammarMsg}</em>}
              </div>
            )}`;
if (a.indexOf(oldBtn) === -1) { console.log("APP ANCHOR MISSING"); process.exit(2); }
a = a.split(oldBtn).join(newBtn);
fs.writeFileSync(ap, a);
console.log("App.tsx msg display fixed");
