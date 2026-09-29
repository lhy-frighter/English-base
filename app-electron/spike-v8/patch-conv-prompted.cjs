const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(cp, "utf8");
let changed = false;
function rep(old, neu, label) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.replace(old, neu); changed = true; console.log("patched", label);
}

// 1) 签名
rep(
  "export default function ConversationPage({ onSendShadow }: { onSendShadow?: (text: string) => void }) {",
  "export interface UsePrompt { assetId: number; canonical: string; kind: string; }\n" +
  "export default function ConversationPage({\n" +
  "  onSendShadow, usePrompt, onPromptConsumed,\n" +
  "}: {\n" +
  "  onSendShadow?: (text: string) => void;\n" +
  "  usePrompt?: UsePrompt | null;\n" +
  "  onPromptConsumed?: () => void;\n" +
  "}) {",
  "signature");

// 2) promptedRef
rep(
  '  const learnKeyRef = useRef<string | null>(null);',
  '  const learnKeyRef = useRef<string | null>(null);\n' +
  '  const promptedRef = useRef<number[]>([]);',
  "ref");

// 3) 引导会话 effect（插在 startSession 之后）
rep(
  "    setSession(sess); setTurns([]); setView(\"chat\"); setInput(\"\"); setTeachMap({});\n  };\n",
  "    setSession(sess); setTurns([]); setView(\"chat\"); setInput(\"\"); setTeachMap({});\n  };\n\n" +
  "  // S13-b-2 「再用一次」：自动开引导会话，让用户用指定表达造句\n" +
  "  useEffect(() => {\n" +
  "    if (!usePrompt) return;\n" +
  "    let alive = true;\n" +
  "    (async () => {\n" +
  "      try {\n" +
  "        const goal = `Use the expression '${usePrompt.canonical}' in your own sentence`;\n" +
  "        const sess = await api.convCreate({\n" +
  "          goal, cefr: \"B1\", suggestedTurns: 4,\n" +
  "          brainEngine: engine,\n" +
  "          brainModelRevision: engine === \"local\"\n" +
  "            ? CURRENT_MODEL : (cloud?.model || \"glm-4.7-flash\"),\n" +
  "        });\n" +
  "        if (!alive) return;\n" +
  "        const guideKey = `turn:${crypto.randomUUID()}`;\n" +
  "        const guide = await api.convAddTurn({\n" +
  "          sessionKey: sess.sessionKey, turnKey: guideKey, role: \"assistant\",\n" +
  "          text: `Now try using \\u201c${usePrompt.canonical}\\u201d in your own sentence. I will give you feedback.`,\n" +
  "          status: \"completed\",\n" +
  "        });\n" +
  "        if (!alive) return;\n" +
  "        activeMsRef.current = 0; summaryRef.current = \"\";\n" +
  "        setSession(sess); setTurns([guide]); setView(\"chat\"); setInput(\"\"); setTeachMap({});\n" +
  "        promptedRef.current = [usePrompt.assetId];\n" +
  "        onPromptConsumed?.();\n" +
  "      } catch (e) {\n" +
  "        setCloudMsg(String(e)); onPromptConsumed?.();\n" +
  "      }\n" +
  "    })();\n" +
  "    return () => { alive = false; };\n" +
  "    // eslint-disable-next-line react-hooks/exhaustive-deps\n" +
  "  }, [usePrompt]);\n",
  "effect");

// 4) send 检测传 prompted
rep(
  "    // S13-b-1 用出证据：自然用出/纠正后用出（中文轮内部跳过，失败不阻塞）\n" +
  "    api.detectUsedAssets({ sessionKey: session.sessionKey, turnKey: userKey, text }).catch(() => {});\n",
  "    // S13-b 用出证据：引导用出/自然用出/纠正后用出（中文轮内部跳过，失败不阻塞）\n" +
  "    {\n" +
  "      const prompted = promptedRef.current.splice(0);\n" +
  "      api.detectUsedAssets({\n" +
  "        sessionKey: session.sessionKey, turnKey: userKey, text, prompted,\n" +
  "      }).catch(() => {});\n" +
  "    }\n",
  "send detect");

if (changed) { fs.writeFileSync(cp, s); console.log("written"); }
else console.log("no changes");
