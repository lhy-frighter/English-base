const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(p, "utf8");

function mustReplace(oldStr, neu, label) {
  if (s.indexOf(oldStr) === -1) { console.log("ANCHOR MISSING:", label); process.exit(2); }
  s = s.split(oldStr).join(neu);
  console.log("ok:", label);
}

// ① imports
mustReplace(
  `import { DebriefPanel, type DebriefContext } from "./components/DebriefPanel";`,
  `import { DebriefPanel, type DebriefContext } from "./components/DebriefPanel";
import { GrammarDiagnosisPanel } from "./components/GrammarDiagnosisPanel";
import { analyzeGrammar } from "./conversation/grammar-engine";
import type { GrammarAnalysis } from "./conversation/grammar-engine";`,
  "imports",
);

// ② state
mustReplace(
  `  const [capSel, setCapSel] = useState<{ text: string } | null>(null); // 转为练习`,
  `  const [capSel, setCapSel] = useState<{ text: string } | null>(null); // 转为练习
  // S15-1 阅读划选云端语法深度分析
  const [readGrammar, setReadGrammar] = useState<GrammarAnalysis | null>(null);
  const [readGrammarBusy, setReadGrammarBusy] = useState(false);
  const [readGrammarMsg, setReadGrammarMsg] = useState("");`,
  "state",
);

// ③ clear grammar panel with selection clears
mustReplace(
  `setSelText("")`,
  `setSelText(""); setReadGrammar(null)`,
  "clear points",
);

// ④ handler after sendToShadow
mustReplace(
  `    setTab("shadow");
  };
  // S11-c 跟读续练（1/3/7 到期句队列）`,
  `    setTab("shadow");
  };

  // S15-1：阅读划选句云端语法深度分析（再点一次收起）
  const openReadGrammar = async () => {
    if (readGrammar) { setReadGrammar(null); return; }
    const text = selText.trim();
    if (!text) return;
    setReadGrammarBusy(true); setReadGrammarMsg("");
    try {
      const r = await analyzeGrammar(text, "");
      if (r.ok) setReadGrammar(r.analysis);
      else {
        const reason = r.reason;
        setReadGrammarMsg(
          reason === "grammar_consent_off" ? "需先在对话页云端设置勾选「文本送云端做语法深度分析」"
            : reason === "cloud_key_missing" ? "请先在对话页云端设置保存 API Key"
            : reason === "bad_json" || reason.startsWith("schema_failed") ? "结构化分析失败，可重试"
            : "深度分析失败：" + reason,
        );
      }
    } finally {
      setReadGrammarBusy(false);
    }
  };
  // S11-c 跟读续练（1/3/7 到期句队列）`,
  "handler",
);

// ⑤ strip button（注意：③ 已把 setSelText("") 替换为带 setReadGrammar(null) 的形式）
mustReplace(
  `                <button className="ghost" onClick={() => setCapSel({ text: selText })}>转为练习</button>
                <button className="ghost" onClick={() => { setSelTrans(null); setSelText(""); setReadGrammar(null); }}>关闭</button>
              </div>
            )}`,
  `                <button className="ghost" onClick={() => setCapSel({ text: selText })}>转为练习</button>
                <button className="ghost" onClick={() => { void openReadGrammar(); }}>
                  {readGrammarBusy ? "分析中…" : "深度语法分析"}
                </button>
                <button className="ghost" onClick={() => { setSelTrans(null); setSelText(""); }}>关闭</button>
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
            )}`,
  "strip + panel",
);

fs.writeFileSync(p, s);
console.log("App.tsx patched");
