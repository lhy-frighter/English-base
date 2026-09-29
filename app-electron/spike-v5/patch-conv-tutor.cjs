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
  `import { AssetCaptureSheet } from "../components/AssetCaptureSheet";`,
  `import { AssetCaptureSheet } from "../components/AssetCaptureSheet";
import { tutorGate, type TutorMode } from "./tutor-gate";
import { splitTeach, visibleOfStream, stripTeachRaw, type TeachPayload } from "./teach-parse";`,
  "imports"
);

// 2) systemPrompt + remove CORRECTION parser
R(
  `function systemPrompt(topic: ConvSession["topic"], forSummary = false): string {
  if (forSummary) {
    return "You are an English tutor. Based ONLY on the conversation, write a short end-of-session report in English: two strengths, and three words or grammar points to review. Be concrete and concise. No small talk.";
  }
  return [
    \`You are a friendly English conversation partner for a Chinese-speaking learner at CEFR \${topic.cefr}.\`,
    \`Keep your own language at \${topic.cefr} level: common words, short sentences.\`,
    \`The conversation topic / goal is: \${topic.goal}.\`,
    "Help them practice; do not quiz them or overwhelm them. Reply in English only.",
    "After your reply, if AND ONLY IF the learner's last message has a grammar or word-choice error,",
    'add one final line in exactly this format: [CORRECTION: "<wrong part>" → "<correct part>" — short reason].',
    "If there is no error, add nothing extra.",
  ].join(" ");
}

const CORRECTION_RE = /\\n?\\[CORRECTION:\\s*([^\\]]*)\\]\\s*$/i;
function parseCorrection(text: string): { reply: string; correction: string } {
  const m = CORRECTION_RE.exec(text.trim());
  if (!m) return { reply: text.trim(), correction: "" };
  return { reply: text.replace(CORRECTION_RE, "").trim(), correction: m[1].trim() };
}`,
  `function systemPrompt(topic: ConvSession["topic"], forSummary = false, mode: TutorMode = "auto"): string {
  if (forSummary) {
    return "You are an English tutor. Based ONLY on the conversation, write a short end-of-session report in English: two strengths, and three words or grammar points to review. Be concrete and concise. No small talk.";
  }
  const lines = [
    \`You are a friendly English conversation partner for a Chinese-speaking learner at CEFR \${topic.cefr}.\`,
    \`Keep your own language at \${topic.cefr} level: common words, short sentences.\`,
    \`The conversation topic / goal is: \${topic.goal}.\`,
    "Help them practice; do not quiz them or overwhelm them.",
    "The learner may write in Chinese, English, or mix the two. Decide your response mode yourself:",
    "- If they ask how to say something (including Chinese such as '怎么说'), give the natural English and append exactly one TEACH block.",
    "- If their message has a grammar or word-choice error worth noting, append exactly one TEACH block with the correction in grammar.",
    "- For ordinary small talk, append nothing extra.",
    "TEACH block format, only as the very final part of your message:",
    '[TEACH: {"en":"natural English sentence(s)","zh":"整句中文意思","chunks":[{"en":"词块","zh":"简释"}],"words":[{"en":"关键词","zh":"简释"}],"grammar":[{"structure":"结构","note":"说明"}]}]',
    "Rules: TEACH.en must match the English you actually wrote; never output more than one TEACH block; never put TEACH inside the visible reply.",
  ];
  if (mode === "teach") {
    lines.push("MODE: TEACH. The learner explicitly wants to learn how to say their message naturally. Provide the natural English reply and a TEACH block even if the message is short.");
  } else if (mode === "chat") {
    lines.push("MODE: CHAT. Just converse naturally; do not append a TEACH block unless the message clearly asks how to say something.");
  }
  return lines.join(" ");
}`,
  "systemPrompt"
);

// 3) refs/state declarations
R(
  `const [compacting, setCompacting] = useState(false);`,
  `const [compacting, setCompacting] = useState(false);
  // V9 tutor：强制模式（显式入口）、待消费 TEACH（#147 教学面板使用，不写库）
  const forceModeRef = useRef<TutorMode>("auto");
  const [forceModeTick, setForceModeTick] = useState(0);
  const pendingTeachRef = useRef<{ turnKey: string; teach: TeachPayload } | null>(null);`,
  "refs"
);

// 4) send gate
R(
  `  const send = async (textArg?: string, onStarted?: () => void) => {
    const text = (textArg ?? input).trim();
    if (!text || busy || !session) return;`,
  `  const send = async (textArg?: string, onStarted?: () => void) => {
    const text = (textArg ?? input).trim();
    if (busy || !session) return;
    const gate = tutorGate(text);
    if (!gate.ok) { setCloudMsg(gate.reason); return; }`,
  "send gate"
);

// 5) runGeneration signature
R(
  `  const runGeneration = async (
    asstKey: string,
    kindOverride?: "cloud" | "local",
    extraUser?: ConvTurn,
  ) => {`,
  `  const runGeneration = async (
    asstKey: string,
    kindOverride?: "cloud" | "local",
    extraUser?: ConvTurn,
    mode: TutorMode = "auto",
  ) => {`,
  "runGeneration sig"
);

// 6) systemPrompt call
R(
  `{ role: "system", content: systemPrompt(session!.topic) },`,
  `{ role: "system", content: systemPrompt(session!.topic, false, mode) },`,
  "systemPrompt call"
);

// 7) streaming feed
R(
  `      for await (const chunk of gen) {
        full = chunk.text; setStreaming(chunk.text);
        if (!firstTokenSeen && chunk.text.trim()) {
          firstTokenSeen = true;
          latencyRef.current.firstToken.push(Math.round(performance.now() - genT0));
        }
        speaker.feed(chunk.text);
        if (stopRequestedRef.current) break;
      }`,
  `      for await (const chunk of gen) {
        full = chunk.text; setStreaming(visibleOfStream(chunk.text));
        if (!firstTokenSeen && stripTeachRaw(chunk.text).trim()) {
          firstTokenSeen = true;
          latencyRef.current.firstToken.push(Math.round(performance.now() - genT0));
        }
        speaker.feed(stripTeachRaw(chunk.text));
        if (stopRequestedRef.current) break;
      }`,
  "streaming feed"
);

// 8) completion split
R(
  `      const { reply, correction } = parseCorrection(full);
      let asstTurn: ConvTurn;
      if (interruptedNow) {
        const committed = reply.slice(0, playedCharEnd);
        asstTurn = await api.convUpdateTurn({
          turnKey: asstKey, status: "interrupted", text: full, committedText: committed,
          playedCharEnd, interruptedAt: Date.now(),
        });
      } else {
        asstTurn = await api.convUpdateTurn({
          turnKey: asstKey, status: "completed", text: reply, committedText: reply, playedCharEnd,
        });
      }
      if (!interruptedNow && correction) {
        const lastUser = [...baseTurns].reverse().find((t) => t.role === "user");
        if (lastUser) {
          const updated = await api.convUpdateTurn({ turnKey: lastUser.turnKey, localFeedback: [correction] });
          setTurns((prev) => prev.map((t) => (t.turnKey === lastUser.turnKey ? updated : t)));
        }
      }`,
  `      const split = splitTeach(full);
      const reply = split.visible;
      let asstTurn: ConvTurn;
      if (interruptedNow) {
        const committed = reply.slice(0, playedCharEnd);
        asstTurn = await api.convUpdateTurn({
          turnKey: asstKey, status: "interrupted", text: reply, committedText: committed,
          playedCharEnd, interruptedAt: Date.now(),
        });
      } else {
        asstTurn = await api.convUpdateTurn({
          turnKey: asstKey, status: "completed", text: reply, committedText: reply, playedCharEnd,
        });
      }
      // TEACH 尾块：本片仅剥离暂存（不写资产），#147 教学面板消费
      if (split.teach) pendingTeachRef.current = { turnKey: asstKey, teach: split.teach };`,
  "completion split"
);

// 9) runGeneration call in send + mode reset
R(
  `    await runGeneration(asstKey, undefined, userTurn);
  };`,
  `    await runGeneration(asstKey, undefined, userTurn, forceModeRef.current);
    forceModeRef.current = "auto";
    setForceModeTick((x) => x + 1);
  };`,
  "send runGeneration call"
);

// 10) explicit entry UI
R(
  `      <div className="conv-input-bar">
        {handsFree ? (`,
  `      <div className="conv-mode-row">
        <button
          className={forceModeRef.current === "teach" ? "mode-btn mode-on" : "mode-btn"}
          disabled={busy}
          onClick={() => {
            forceModeRef.current = forceModeRef.current === "teach" ? "auto" : "teach";
            setForceModeTick((x) => x + 1);
          }}
        >教我怎么说</button>
        <button
          className={forceModeRef.current === "chat" ? "mode-btn mode-on" : "mode-btn"}
          disabled={busy}
          onClick={() => {
            forceModeRef.current = forceModeRef.current === "chat" ? "auto" : "chat";
            setForceModeTick((x) => x + 1);
          }}
        >我只是想聊天</button>
        {forceModeTick >= 0 ? null : null}
      </div>
      <div className="conv-input-bar">
        {handsFree ? (`,
  "mode UI"
);

fs.writeFileSync(p, s);
console.log("ConversationPage patched");
