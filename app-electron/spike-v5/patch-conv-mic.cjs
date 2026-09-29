const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(p, "utf8");

// 1) imports
const impAnchor = `} from "./context-window";
`;
if (!s.includes(impAnchor)) throw new Error("import anchor missing");
s = s.replace(
  impAnchor,
  impAnchor +
    `import { startCapture, type VoiceCapture } from "./voice-input";
import { asr } from "../asr/asr";
import { inference } from "../inference/coordinator";
`,
);

// 2) 语音状态 + handlers（插在 send 之前）
const sendAnchor = `  const send = async () => {
    const text = input.trim();
    if (!text || busy || !session) return;
    setBusy(true); setInput("");
`;
if (!s.includes(sendAnchor)) throw new Error("send anchor missing");
const voiceBlock = `  // —— V8-3 语音输入 ——
  const captureRef = useRef<VoiceCapture | null>(null);
  const latencyRef = useRef<{ asr: number[] }>({ asr: [] });
  const [micState, setMicState] = useState<"idle" | "recording" | "asr">("idle");
  const [asrDraft, setAsrDraft] = useState("");
  const [micErr, setMicErr] = useState("");

  const toggleMic = async () => {
    if (busy || !session || micState === "asr") return;
    if (micState === "recording") {
      const t0 = performance.now();
      setMicState("asr"); setMicErr("");
      try {
        const cap = captureRef.current;
        if (!cap) throw new Error("录音未开始");
        const { pcm } = await cap.stop();
        await inference.acquire("asr");
        await asr.init("wasm", "whisper-base");
        const r = await asr.transcribe(pcm);
        latencyRef.current.asr.push(Math.round(performance.now() - t0));
        setAsrDraft(r.text);
      } catch (e) {
        setMicErr("识别失败：" + ((e as Error).message || String(e)));
      } finally {
        setMicState("idle");
      }
      return;
    }
    setMicErr(""); setAsrDraft("");
    try {
      captureRef.current = await startCapture();
      setMicState("recording");
    } catch (e) {
      setMicErr("无法开始录音：" + ((e as Error).message || String(e)));
    }
  };

  const confirmAsr = () => {
    const t = asrDraft.trim();
    if (!t) return;
    setAsrDraft("");
    void send(t);
  };

`;
s = s.replace(sendAnchor, voiceBlock + sendAnchor);

// 3) send 支持文本参数、清语音状态
const sendSigOld = `  const send = async () => {
    const text = input.trim();
    if (!text || busy || !session) return;
    setBusy(true); setInput("");
`;
const sendSigNew = `  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    if (!text || busy || !session) return;
    setBusy(true); setInput(""); setAsrDraft(""); setMicErr("");
`;
if (!s.includes(sendSigOld)) throw new Error("send signature anchor missing");
s = s.replace(sendSigOld, sendSigNew);

// 4) UI：ASR 确认条 + mic 按钮
const barOld = `      <div className="conv-input-bar">
        <input
          className="conv-input"
          value={input}
          disabled={busy}
          placeholder={busy ? "大脑思考中…" : "输入英文，回车发送"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
        />
        <button className="btn-primary" disabled={busy || !input.trim()} onClick={() => { void send(); }}>发送</button>
      </div>`;
const barNew = `      {asrDraft && (
        <div className="conv-asr-bar">
          <span className="conv-asr-label">识别为（可修改）</span>
          <input
            className="conv-input"
            value={asrDraft}
            onChange={(e) => setAsrDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmAsr(); }}
          />
          <button className="btn-primary" onClick={confirmAsr}>发送</button>
          <button className="ghost2" onClick={() => setAsrDraft("")}>取消</button>
        </div>
      )}
      {micErr && <div className="conv-asr-bar"><em className="err-text">{micErr}</em></div>}

      <div className="conv-input-bar">
        <button
          className={micState === "recording" ? "mic-btn mic-on" : "mic-btn"}
          disabled={busy || micState === "asr"}
          onClick={() => { void toggleMic(); }}
        >
          {micState === "recording" ? "停止" : micState === "asr" ? "识别中…" : "录音"}
        </button>
        <input
          className="conv-input"
          value={input}
          disabled={busy}
          placeholder={busy ? "大脑思考中…" : "输入英文，或点录音说话，回车发送"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
        />
        <button className="btn-primary" disabled={busy || !input.trim()} onClick={() => { void send(); }}>发送</button>
      </div>`;
if (!s.includes(barOld)) throw new Error("input bar anchor missing");
s = s.replace(barOld, barNew);

fs.writeFileSync(p, s);
console.log("ConversationPage V8-3b wired");
