const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(cp, "utf8");
let changed = false;

// import DebriefCandidate type
{
  const anchor = 'import type { CapturePrefill } from "../components/AssetCaptureSheet";';
  const add = '\nimport type { DebriefCandidate } from "../api";';
  if (s.indexOf(anchor) === -1) throw new Error("import anchor missing");
  if (s.indexOf(add) === -1) {
    s = s.slice(0, s.indexOf(anchor) + anchor.length) + add +
      s.slice(s.indexOf(anchor) + anchor.length);
    changed = true; console.log("import added");
  }
}

// 结束并复盘：写 debrief 草稿
{
  const anchor =
    '      await api.convClose({ sessionKey: session.sessionKey, activeMs: activeMsRef.current, status: "closed" });\n' +
    '      learnKeyRef.current = null;\n' +
    '      setView("setup"); setSession(null); setTurns([]); setTeachMap({});';
  const add =
    '      await api.convClose({ sessionKey: session.sessionKey, activeMs: activeMsRef.current, status: "closed" });\n' +
    '      learnKeyRef.current = null;\n' +
    '      // S13-a-2 复盘草稿：本场 TEACH 的词块/词（已沉淀的由 captureAsset identity 幂等兜底）\n' +
    '      try {\n' +
    '        const candidates: DebriefCandidate[] = [];\n' +
    '        for (const t of Object.values(teachMap)) {\n' +
    '          for (const c of t.chunks) {\n' +
    '            if (!c.en.trim()) continue;\n' +
    '            candidates.push({ kind: "chunk", canonical: c.en, gloss: c.zh, sentence: t.en,\n' +
    '              payload: { example_en: t.en, example_zh: t.zh, zh_intent: t.zh } });\n' +
    '          }\n' +
    '          for (const w of t.words) {\n' +
    '            if (!w.en.trim()) continue;\n' +
    '            candidates.push({ kind: "word", canonical: w.en, gloss: w.zh, sentence: t.en });\n' +
    '          }\n' +
    '        }\n' +
    '        if (candidates.length) {\n' +
    '          await api.debriefPut({ origin_kind: "conversation", origin_ref: session.sessionKey, candidates });\n' +
    '        }\n' +
    '      } catch { /* 草稿失败不阻塞结束 */ }\n' +
    '      setView("setup"); setSession(null); setTurns([]); setTeachMap({});';
  if (s.indexOf(anchor) === -1) throw new Error("end anchor missing");
  if (s.indexOf(add) === -1) { s = s.replace(anchor, add); changed = true; console.log("debrief draft added"); }
}

if (changed) { fs.writeFileSync(cp, s); console.log("written"); }
else console.log("no changes");
