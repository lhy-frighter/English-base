const fs = require("node:fs");
const ap = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let a = fs.readFileSync(ap, "utf8");

const old = `                <button className="ghost" onClick={() => { void openReadGrammar(); }}>
                  {readGrammarBusy ? "分析中…" : "深度语法分析"}
                </button>
                <button className="ghost" onClick={() => { setSelTrans(null); setSelText(""); }}>关闭</button>
              </div>
            )}`;
const neu = `                <button className="ghost" onClick={() => { void openReadGrammar(); }}>
                  {readGrammarBusy ? "分析中…" : "深度语法分析"}
                </button>
                <button className="ghost" onClick={() => {
                  setSelTrans(null); setSelText(""); setReadGrammar(null); setReadGrammarMsg("");
                }}>关闭</button>
                {readGrammarMsg && <em className="err-text">{readGrammarMsg}</em>}
              </div>
            )}`;

if (a.indexOf(old) === -1) { console.log("ANCHOR MISSING"); process.exit(2); }
a = a.split(old).join(neu);
fs.writeFileSync(ap, a);
console.log("App.tsx strip fixed");
