const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(p, "utf8");

// 1) import
const impOld = `import { inference } from "../inference/coordinator";
`;
if (!s.includes(impOld)) throw new Error("inference import anchor missing");
s = s.replace(
  impOld,
  impOld + `import { startStreamingSpeaker, type StreamingSpeaker } from "../tts";
`,
);

// 2) latency ref 扩展
const latOld = `  const latencyRef = useRef<{ asr: number[] }>({ asr: [] });
  const [micState, setMicState] = useState<"idle" | "recording" | "asr">("idle");
  const [asrDraft, setAsrDraft] = useState("");
  const [micErr, setMicErr] = useState("");
`;
const latNew = `  const latencyRef = useRef<{ asr: number[]; firstToken: number[]; firstAudio: number[] }>(
    { asr: [], firstToken: [], firstAudio: [] },
  );
  const [micState, setMicState] = useState<"idle" | "recording" | "asr">("idle");
  const [asrDraft, setAsrDraft] = useState("");
  const [micErr, setMicErr] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [speakPhase, setSpeakPhase] = useState<"idle" | "loading" | "speaking">("idle");
  const speakerRef = useRef<StreamingSpeaker | null>(null);
`;
if (!s.includes(latOld)) throw new Error("latency anchor missing");
s = s.replace(latOld, latNew);

// 3) 流式生成接 speaker
const streamOld = `      let full = "";
      const stream = localEngine.stream(messages, { maxTokens: 220 });
      for await (const chunk of stream) { full = chunk.text; setStreaming(chunk.text); }
      setStreaming("");
      const { reply, correction } = parseCorrection(full);
      asstTurn = await api.convUpdateTurn({
        turnKey: asstKey, status: "completed", text: reply, committedText: reply,
      });`;
const streamNew = `      const genT0 = performance.now();
      const speaker = startStreamingSpeaker({
        enabled: voiceOn,
        onFirstAudio: () => latencyRef.current.firstAudio.push(Math.round(performance.now() - genT0)),
        onPhase: (ph) => setSpeakPhase(ph),
      });
      speakerRef.current = speaker;
      let full = "";
      let firstTokenSeen = false;
      const stream = localEngine.stream(messages, { maxTokens: 220 });
      for await (const chunk of stream) {
        full = chunk.text; setStreaming(chunk.text);
        if (!firstTokenSeen && chunk.text.trim()) {
          firstTokenSeen = true;
          latencyRef.current.firstToken.push(Math.round(performance.now() - genT0));
        }
        speaker.feed(chunk.text);
      }
      setStreaming("");
      await speaker.end();
      const playedCharEnd = speaker.playedCharEnd;
      speakerRef.current = null;
      const { reply, correction } = parseCorrection(full);
      asstTurn = await api.convUpdateTurn({
        turnKey: asstKey, status: "completed", text: reply, committedText: reply, playedCharEnd,
      });`;
if (!s.includes(streamOld)) throw new Error("stream block anchor missing");
s = s.replace(streamOld, streamNew);

// 4) catch 中打断 speaker
const catchOld = `    } catch (e) {
      setStreaming("");
      setCompacting(false);
      const code = (e as Error).message?.slice(0, 120) || "unknown";`;
const catchNew = `    } catch (e) {
      setStreaming("");
      setCompacting(false);
      if (speakerRef.current) { speakerRef.current.stop(); speakerRef.current = null; setSpeakPhase("idle"); }
      const code = (e as Error).message?.slice(0, 120) || "unknown";`;
if (!s.includes(catchOld)) throw new Error("catch anchor missing");
s = s.replace(catchOld, catchNew);

// 5) header 加出声开关
const headOld = `        <span className="muted">{session?.topic.cefr} · {userTurns}/{suggested} 轮</span>
        <button className="btn-primary conv-end" disabled={busy} onClick={() => { void endSession(); }}>`;
const headNew = `        <span className="muted">{session?.topic.cefr} · {userTurns}/{suggested} 轮</span>
        <button
          className="ghost2 conv-voice-toggle"
          onClick={() => setVoiceOn((v) => !v)}
        >
          出声：{voiceOn ? "开" : "关"}{speakPhase === "speaking" ? " · 播放中" : ""}
        </button>
        <button className="btn-primary conv-end" disabled={busy} onClick={() => { void endSession(); }}>`;
if (!s.includes(headOld)) throw new Error("header anchor missing");
s = s.replace(headOld, headNew);

fs.writeFileSync(p, s);
console.log("ConversationPage streaming speaker wired");
