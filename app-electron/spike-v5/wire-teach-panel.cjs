const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  if (s.indexOf(oldStr, i + 1) >= 0) throw new Error("NOT UNIQUE: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// 1) imports
R(
  `import { splitTeach, visibleOfStream, stripTeachRaw, type TeachPayload } from "./teach-parse";`,
  `import { splitTeach, visibleOfStream, stripTeachRaw, type TeachPayload } from "./teach-parse";
import { TutorTeachPanel } from "./TutorTeachPanel";
import type { CapturePrefill } from "../components/AssetCaptureSheet";`,
  "imports"
);

// 2) teachMap state 取代 pendingTeachRef
R(
  `  const pendingTeachRef = useRef<{ turnKey: string; teach: TeachPayload } | null>(null);`,
  `  const [teachMap, setTeachMap] = useState<Record<string, TeachPayload>>({});`,
  "teachMap"
);

// 3) cap state 扩展
R(
  `const [cap, setCap] = useState<{ text: string; ref: string } | null>(null);`,
  `const [cap, setCap] = useState<{ text: string; ref: string; sentence?: string; prefill?: CapturePrefill } | null>(null);`,
  "cap state"
);

// 4) completion 挂面板
R(
  `      // TEACH 尾块：本片仅剥离暂存（不写资产），#147 教学面板消费
      if (split.teach) pendingTeachRef.current = { turnKey: asstKey, teach: split.teach };`,
  `      // TEACH 尾块：挂教学面板（草稿，不自动成卡）
      if (split.teach) setTeachMap((prev) => ({ ...prev, [asstKey]: split.teach }));`,
  "completion"
);

// 5) 面板渲染
R(
  `              {t.status === "completed" && (t.committedText || t.text) && (
                <div className="conv-cap-row">
                  <button type="button" className="ghost2"
                    onClick={() => openCap(t.committedText || t.text, t.turnKey)}>转为练习</button>
                </div>
              )}
            </div>
          );`,
  `              {t.status === "completed" && (t.committedText || t.text) && (
                <div className="conv-cap-row">
                  <button type="button" className="ghost2"
                    onClick={() => openCap(t.committedText || t.text, t.turnKey)}>转为练习</button>
                </div>
              )}
              {teachMap[t.turnKey] && (
                <TutorTeachPanel
                  teach={teachMap[t.turnKey]}
                  turnKey={t.turnKey}
                  onDismiss={() => setTeachMap((prev) => {
                    const n = { ...prev }; delete n[t.turnKey]; return n;
                  })}
                  onPick={(prefill, sentence) => setCap({
                    text: prefill.canonical ?? "", ref: t.turnKey, sentence, prefill,
                  })}
                />
              )}
            </div>
          );`,
  "panel render"
);

// 6) sheet props
R(
  `      <AssetCaptureSheet
        open={!!cap}
        source={cap ? { originKind: "conversation", originRef: cap.ref, title: "英语对话", sentence: cap.text } : null}
        initialText={cap?.text ?? ""}
        onClose={() => setCap(null)}
        onWord={capWord}
      />`,
  `      <AssetCaptureSheet
        open={!!cap}
        source={cap ? { originKind: "conversation", originRef: cap.ref, title: "英语对话", sentence: cap.sentence || cap.text } : null}
        initialText={cap?.text ?? ""}
        prefill={cap?.prefill ?? null}
        onClose={() => setCap(null)}
        onWord={capWord}
      />`,
  "sheet props"
);

// 7) 话题切换清面板
R(
  `setSession(sess); setTurns([]); setView("chat"); setInput("");`,
  `setSession(sess); setTurns([]); setView("chat"); setInput(""); setTeachMap({});`,
  "start topic"
);
R(
  `setView("setup"); setSession(null); setTurns([]); setStreaming("");`,
  `setView("setup"); setSession(null); setTurns([]); setStreaming(""); setTeachMap({});`,
  "back to setup"
);
R(
  `      setView("setup"); setSession(null); setTurns([]);`,
  `      setView("setup"); setSession(null); setTurns([]); setTeachMap({});`,
  "end session"
);

fs.writeFileSync(p, s);
console.log("ConversationPage teach wiring done");
