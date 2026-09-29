const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(cp, "utf8");
let changed = false;
function rep(old, neu, label) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.replace(old, neu); changed = true; console.log("patched", label);
}

// 1) passedTurns state（在 weakAssetsRef 后）
rep(
  "  const weakAssetsRef = useRef<import(\"./conversation-prompt\").WeakAssetSeed[]>([]);",
  "  const weakAssetsRef = useRef<import(\"./conversation-prompt\").WeakAssetSeed[]>([]);\n" +
  "  const [passedTurns, setPassedTurns] = useState<Set<string>>(new Set());",
  "state");

// 2) effect：turns 变化时拉通过标记（插在 startSession 定义之前）
rep(
  "  const startSession = async () => {",
  "  // S13-d-1 哪些对话句已跟读通过\n" +
  "  useEffect(() => {\n" +
  "    if (!turns.length) { setPassedTurns(new Set()); return; }\n" +
  "    let alive = true;\n" +
  "    Promise.all(turns.map((t) => api.shadowPassedForTurn(t.turnKey)\n" +
  "      .then((f) => [t.turnKey, f] as [string, boolean])))\n" +
  "      .then((rs) => {\n" +
  "        if (!alive) return;\n" +
  "        setPassedTurns(new Set(rs.filter(([, f]) => f).map(([k]) => k)));\n" +
  "      }).catch(() => {});\n" +
  "    return () => { alive = false; };\n" +
  "  }, [turns]);\n\n" +
  "  const startSession = async () => {",
  "effect");

// 3) 助手气泡 ✓（在 shownText 后加）
rep(
  "              <div className={isClarify ? \"conv-bubble conv-clarify-bubble\" : \"conv-bubble\"}>\n" +
  "                {shownText}\n" +
  "                {t.status === \"interrupted\" && <em className=\"muted\">（已打断）</em>}",
  "              <div className={isClarify ? \"conv-bubble conv-clarify-bubble\" : \"conv-bubble\"}>\n" +
  "                {shownText}\n" +
  "                {passedTurns.has(t.turnKey) && <i className=\"shadow-pass-inline\" title=\"已跟读通过\">✓ 已跟读通过</i>}\n" +
  "                {t.status === \"interrupted\" && <em className=\"muted\">（已打断）</em>}",
  "bubble check");

// 4) sheet onSendShadow 包 origin
rep(
  "        onSendShadow={onSendShadow}",
  "        onSendShadow={(sentence) => onSendShadow?.(sentence, {\n" +
  "          originKind: \"conversation\", originRef: cap?.ref ?? \"\",\n" +
  "        })}",
  "sheet wrap");

if (changed) { fs.writeFileSync(cp, s); console.log("written"); }
else console.log("no changes");
