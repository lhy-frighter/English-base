const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(p, "utf8");

function mustReplace(oldStr, neu, label) {
  if (s.indexOf(oldStr) === -1) { console.log("ANCHOR MISSING:", label); process.exit(2); }
  s = s.split(oldStr).join(neu);
  console.log("ok:", label);
}

// ① imports
mustReplace(
  'import { TutorTeachPanel } from "./TutorTeachPanel";',
  `import { TutorTeachPanel } from "./TutorTeachPanel";
import { GrammarDiagnosisPanel } from "../components/GrammarDiagnosisPanel";
import { analyzeGrammar } from "./grammar-engine";
import type { GrammarAnalysis } from "./grammar-engine";`,
  "imports",
);

// ② module-level reason mapper（after fmtWhen）
mustReplace(
  `function fmtWhen(ts: number) {
  const d = new Date(ts);
  return \`\${d.getMonth() + 1}/\${d.getDate()} \${String(d.getHours()).padStart(2, "0")}:\${String(d.getMinutes()).padStart(2, "0")}\`;
}`,
  `function fmtWhen(ts: number) {
  const d = new Date(ts);
  return \`\${d.getMonth() + 1}/\${d.getDate()} \${String(d.getHours()).padStart(2, "0")}:\${String(d.getMinutes()).padStart(2, "0")}\`;
}

// S15-1 深度分析失败原因 → 人话提示
function grammarReason(reason: string): string {
  if (reason === "grammar_consent_off") return "需先在云端设置勾选「文本送云端做语法深度分析」";
  if (reason === "cloud_key_missing") return "请先在云端设置保存 API Key";
  if (reason === "cloud_endpoint_missing") return "云端端点缺失";
  if (reason === "bad_json" || reason.startsWith("schema_failed")) return "结构化分析失败，可重试";
  return "深度分析失败：" + reason;
}`,
  "reason mapper",
);

// ③ state after teachMap
mustReplace(
  'const [teachMap, setTeachMap] = useState<Record<string, TeachPayload>>({});',
  `const [teachMap, setTeachMap] = useState<Record<string, TeachPayload>>({});
  // S15-1 语法深度诊断结果（按 turnKey）
  const [grammarMap, setGrammarMap] = useState<Record<string, GrammarAnalysis>>({});
  const [grammarBusy, setGrammarBusy] = useState<string | null>(null);`,
  "state",
);

// ④ reset grammarMap wherever teachMap resets
mustReplace(
  "setTeachMap({});",
  "setTeachMap({}); setGrammarMap({});",
  "reset points",
);

// ⑤ openGrammar function after clearKey
mustReplace(
  `  const clearKey = async () => {
    await api.cloudClearKey();
    setKeySet(false); setCloudMsg("");
  };`,
  `  const clearKey = async () => {
    await api.cloudClearKey();
    setKeySet(false); setCloudMsg("");
  };

  // S15-1：对用户某一轮做云端语法深度分析（再点一次收起面板）
  const openGrammar = async (t: ConvTurn) => {
    if (grammarMap[t.turnKey]) {
      setGrammarMap((prev) => { const n = { ...prev }; delete n[t.turnKey]; return n; });
      return;
    }
    setGrammarBusy(t.turnKey); setCloudMsg("");
    try {
      const idx = turns.findIndex((x) => x.turnKey === t.turnKey);
      const ctx = turns.slice(0, Math.max(0, idx)).slice(-6)
        .map((x) => (x.role === "user" ? "User: " : "Tutor: ")
          + (x.role === "user" ? x.text : (x.committedText || x.text)))
        .join("\\n");
      const r = await analyzeGrammar(t.text, ctx);
      if (r.ok) setGrammarMap((prev) => ({ ...prev, [t.turnKey]: r.analysis }));
      else setCloudMsg(grammarReason(r.reason));
    } finally {
      setGrammarBusy(null);
    }
  };`,
  "openGrammar",
);

// ⑥ user bubble: button + panel
mustReplace(
  `                {t.text && (
                  <div className="conv-cap-row">
                    <button type="button" className="ghost2"
                      onClick={() => { void openCap(t.text, t.turnKey); }}>转为练习</button>
                  </div>
                )}`,
  `                {t.text && (
                  <div className="conv-cap-row">
                    <button type="button" className="ghost2"
                      onClick={() => { void openCap(t.text, t.turnKey); }}>转为练习</button>
                    {/[A-Za-z]/.test(t.text) && (
                      <button type="button" className="ghost2"
                        onClick={() => { void openGrammar(t); }}>
                        {grammarBusy === t.turnKey ? "分析中…" : "深度语法分析"}
                      </button>
                    )}
                  </div>
                )}
                {grammarMap[t.turnKey] && (
                  <GrammarDiagnosisPanel
                    source={{ originKind: "conversation", originRef: t.turnKey, title: session?.title || "英语对话" }}
                    text={t.text}
                    analysis={grammarMap[t.turnKey]}
                    onClose={() => setGrammarMap((prev) => { const n = { ...prev }; delete n[t.turnKey]; return n; })}
                  />
                )}`,
  "user bubble",
);

// ⑦ cloud settings toggle after audio toggle
mustReplace(
  `              <label className="cloud-toggle">
                <input type="checkbox" checked={cloud.audio} onChange={() => { void toggleCloud("audio"); }} />
                <span>上传录音原文（用于云端发音分析）</span>
              </label>`,
  `              <label className="cloud-toggle">
                <input type="checkbox" checked={cloud.audio} onChange={() => { void toggleCloud("audio"); }} />
                <span>上传录音原文（用于云端发音分析）</span>
              </label>
              <label className="cloud-toggle">
                <input type="checkbox" checked={cloud.grammarCloud} onChange={() => { void toggleCloud("grammarCloud"); }} />
                <span>文本送云端做语法深度分析（逐句批改并生成语法练习）</span>
              </label>`,
  "settings toggle",
);

fs.writeFileSync(p, s);
console.log("ConversationPage patched");
