const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(cp, "utf8");
let changed = false;
function rep(old, neu, label) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.replace(old, neu); changed = true; console.log("patched", label);
}

// 1) Props 解构 + 类型
rep(
  "  onSendShadow, usePrompt, onPromptConsumed,\n}: {\n",
  "  onSendShadow, usePrompt, onPromptConsumed,\n  examDrill, onExamDrillConsumed,\n}: {\n",
  "props destructure");

rep(
  "  usePrompt?: UsePrompt | null;\n  onPromptConsumed?: () => void;\n",
  "  usePrompt?: UsePrompt | null;\n  onPromptConsumed?: () => void;\n" +
  "  examDrill?: import(\"../api\").ExamWeakItem | null;\n" +
  "  onExamDrillConsumed?: () => void;\n",
  "props type");

// 2) effect（插在 usePrompt effect 之后、openHistory 之前）
const anchor = "  const openHistory = async (sess: ConvSession) => {";
if (s.indexOf("examDrill)") === -1) {
  const add =
"  // S13-d-2 错题对话演练：带考点开会话，先解释再请用户造句\n" +
"  useEffect(() => {\n" +
"    if (!examDrill) return;\n" +
"    let alive = true;\n" +
"    (async () => {\n" +
"      try {\n" +
"        const point = examDrill.point || examDrill.reason || \"the tested expression\";\n" +
"        const goal = `Help me master this CET-6 point: ${point}. \"\n" +
"          + `Question context: ${examDrill.stem}`\n" +
"          + (examDrill.answer ? ` (correct answer: ${examDrill.answer})` : \"\")\n" +
"          + `. Explain it briefly, then invite me to make my own sentence with it.`;\n" +
"        const sess = await api.convCreate({\n" +
"          goal, cefr: \"B1\", suggestedTurns: 5,\n" +
"          brainEngine: engine,\n" +
"          brainModelRevision: engine === \"local\"\n" +
"            ? CURRENT_MODEL : (cloud?.model || \"glm-4.7-flash\"),\n" +
"        });\n" +
"        if (!alive) return;\n" +
"        const guideKey = `turn:${crypto.randomUUID()}`;\n" +
"        const guide = await api.convAddTurn({\n" +
"          sessionKey: sess.sessionKey, turnKey: guideKey, role: \"assistant\",\n" +
"          text: `Let us work on this point together. Here is the question: ${examDrill.stem} \"\n" +
"            + (examDrill.answer ? `The correct answer is ${examDrill.answer}. ` : \"\")\n" +
"            + `Now, can you make your own sentence using this point?`,\n" +
"          status: \"completed\",\n" +
"        });\n" +
"        if (!alive) return;\n" +
"        activeMsRef.current = 0; summaryRef.current = \"\";\n" +
"        weakAssetsRef.current = [];\n" +
"        setSession(sess); setTurns([guide]); setView(\"chat\"); setInput(\"\"); setTeachMap({});\n" +
"        onExamDrillConsumed?.();\n" +
"      } catch (e) {\n" +
"        setCloudMsg(String(e)); onExamDrillConsumed?.();\n" +
"      }\n" +
"    })();\n" +
"    return () => { alive = false; };\n" +
"    // eslint-disable-next-line react-hooks/exhaustive-deps\n" +
"  }, [examDrill]);\n\n";
  s = s.replace(anchor, add + anchor); changed = true; console.log("effect added");
}

if (changed) { fs.writeFileSync(cp, s); console.log("written"); }
else console.log("no changes");
