const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(cp, "utf8");
let changed = false;
function rep(old, neu, label) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.replace(old, neu); changed = true; console.log("patched", label);
}

// 1) weakAssetsRef
rep(
  "  const promptedRef = useRef<number[]>([]);",
  "  const promptedRef = useRef<number[]>([]);\n" +
  "  const weakAssetsRef = useRef<import(\"./conversation-prompt\").WeakAssetSeed[]>([]);",
  "ref");

// 2) startSession 拉弱点
rep(
  "    activeMsRef.current = 0;\n" +
  "    summaryRef.current = \"\";\n" +
  "    setSession(sess); setTurns([]); setView(\"chat\"); setInput(\"\"); setTeachMap({});\n" +
  "  };\n",
  "    activeMsRef.current = 0;\n" +
  "    summaryRef.current = \"\";\n" +
  "    try {\n" +
  "      const weak = await api.priorityList({ limit: 2, kinds: [\"chunk\", \"grammar\", \"pronunciation\"] });\n" +
  "      weakAssetsRef.current = weak.map((p) => ({\n" +
  "        canonical: p.canonical, gloss: p.gloss, kind: p.asset_kind,\n" +
  "      }));\n" +
  "    } catch { weakAssetsRef.current = []; }\n" +
  "    setSession(sess); setTurns([]); setView(\"chat\"); setInput(\"\"); setTeachMap({});\n" +
  "  };\n",
  "startSession");

// 3) runGeneration 系统提示词带弱点
rep(
  "        { role: \"system\", content: systemPrompt(session!.topic, false, mode) },",
  "        { role: \"system\", content: systemPrompt(\n" +
  "          session!.topic, false, mode, weakAssetsRef.current) },",
  "gen prompt");

// 4) usePrompt 引导会话：弱点清空（引导本身即提示）
rep(
  "        activeMsRef.current = 0; summaryRef.current = \"\";\n" +
  "        setSession(sess); setTurns([guide]); setView(\"chat\"); setInput(\"\"); setTeachMap({});\n" +
  "        promptedRef.current = [usePrompt.assetId];",
  "        activeMsRef.current = 0; summaryRef.current = \"\";\n" +
  "        weakAssetsRef.current = [];\n" +
  "        setSession(sess); setTurns([guide]); setView(\"chat\"); setInput(\"\"); setTeachMap({});\n" +
  "        promptedRef.current = [usePrompt.assetId];",
  "prompted session");

// 5) backToSetup 重置
rep(
  "    learnKeyRef.current = null;\n" +
  "    summaryRef.current = \"\";",
  "    learnKeyRef.current = null;\n" +
  "    summaryRef.current = \"\";\n" +
  "    weakAssetsRef.current = [];",
  "back reset");

if (changed) { fs.writeFileSync(cp, s); console.log("written"); }
else console.log("no changes");
