const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/ExamPage.tsx";
let s = fs.readFileSync(p, "utf8");

function mustReplace(oldStr, neu, label) {
  if (s.indexOf(oldStr) === -1) { console.log("ANCHOR MISSING:", label); process.exit(2); }
  s = s.split(oldStr).join(neu);
  console.log("ok:", label);
}

// ① imports
mustReplace(
  `import { AssetCaptureSheet } from "./components/AssetCaptureSheet";`,
  `import { AssetCaptureSheet } from "./components/AssetCaptureSheet";
import { GrammarDiagnosisPanel } from "./components/GrammarDiagnosisPanel";
import { analyzeGrammar } from "./conversation/grammar-engine";
import type { GrammarAnalysis } from "./conversation/grammar-engine";`,
  "imports",
);

// ② PaperQuestion type import
mustReplace(
  `  type ExamWeakItem,
} from "./api";`,
  `  type ExamWeakItem, type PaperQuestion,
} from "./api";`,
  "type import",
);

// ③ state
mustReplace(
  `  const [redoMsg, setRedoMsg] = useState<Record<number, string>>({});`,
  `  const [redoMsg, setRedoMsg] = useState<Record<number, string>>({});

  // S15-1 写作题云端深度批改（按题号）
  const [writingGrammar, setWritingGrammar] = useState<Record<string, GrammarAnalysis>>({});
  const [writingBusy, setWritingBusy] = useState<string | null>(null);
  const [writingMsg, setWritingMsg] = useState<Record<string, string>>({});`,
  "state",
);

// ④ openWritingGrammar（insert before refreshPapers）
mustReplace(
  `  const refreshPapers = useCallback(() => {`,
  `  // S15-1：写作主观题云端深度批改（再点一次收起）
  const openWritingGrammar = async (q: PaperQuestion, picked0: string) => {
    const key = String(q.index);
    if (writingGrammar[key]) {
      setWritingGrammar((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }
    const picked = picked0.trim();
    if (!picked) {
      setWritingMsg((prev) => ({ ...prev, [key]: "请先填写作答" }));
      return;
    }
    setWritingBusy(key);
    try {
      const r = await analyzeGrammar(picked, "Writing task prompt: " + q.stem);
      if (r.ok) {
        setWritingGrammar((prev) => ({ ...prev, [key]: r.analysis }));
      } else {
        const reason = r.reason;
        const txt = reason === "grammar_consent_off"
          ? "需先在对话页云端设置勾选「文本送云端做语法深度分析」"
          : reason === "cloud_key_missing"
            ? "请先在对话页云端设置保存 API Key"
            : reason === "bad_json" || reason.startsWith("schema_failed")
              ? "结构化分析失败，可重试"
              : "深度分析失败：" + reason;
        setWritingMsg((prev) => ({ ...prev, [key]: txt }));
      }
    } finally {
      setWritingBusy(null);
    }
  };

  const refreshPapers = useCallback(() => {`,
  "openWritingGrammar",
);

// ⑤ result view: replace muted line with button + panel
mustReplace(
  `                {d.model && <p className="write-model"><span className="lbl">参考范文</span>{d.model}</p>}
                <p className="muted">离线不评分（Agent 期接入），请自行对照范文修改。</p>`,
  `                {d.model && <p className="write-model"><span className="lbl">参考范文</span>{d.model}</p>}
                <div className="write-cloud-row">
                  <button type="button" className="ghost2"
                    onClick={() => { void openWritingGrammar(q, d.picked); }}>
                    {writingBusy === String(q.index) ? "分析中…" : "☁️ 云端深度批改"}
                  </button>
                  {writingMsg[q.index] && <em className="err-text">{writingMsg[q.index]}</em>}
                </div>
                {writingGrammar[q.index] && (
                  <GrammarDiagnosisPanel
                    source={{ originKind: "exam", originRef: \`\${paper.id}:\${q.index}\`, title: paper.title }}
                    text={d.picked.trim()}
                    analysis={writingGrammar[q.index]}
                    onClose={() => setWritingGrammar((prev) => {
                      const n = { ...prev }; delete n[String(q.index)]; return n;
                    })}
                  />
                )}`,
  "result writing",
);

fs.writeFileSync(p, s);
console.log("ExamPage patched");
