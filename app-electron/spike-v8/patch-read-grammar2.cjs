const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(p, "utf8");

const old = `                <button className="ghost" onClick={() => setCapSel({ text: selText })}>转为练习</button>
                <button className="ghost" onClick={() => { setSelTrans(null); setSelText(""); setReadGrammar(null); }}>关闭</button>
              </div>
            )}`;
const neu = `                <button className="ghost" onClick={() => setCapSel({ text: selText })}>转为练习</button>
                <button className="ghost" onClick={() => { void openReadGrammar(); }}>
                  {readGrammarBusy ? "分析中…" : "深度语法分析"}
                </button>
                <button className="ghost" onClick={() => { setSelTrans(null); setSelText(""); setReadGrammar(null); }}>关闭</button>
              </div>
            )}
            {readGrammar && selText && ann && (
              <GrammarDiagnosisPanel
                source={{
                  originKind: "reading", originRef: String(ann.text_id),
                  title: texts.find((t) => t.id === ann.text_id)?.title || "阅读文章",
                }}
                text={selText}
                analysis={readGrammar}
                onClose={() => setReadGrammar(null)}
              />
            )}`;

if (s.indexOf(old) === -1) { console.log("ANCHOR MISSING"); process.exit(2); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log("App.tsx strip+panel patched");
