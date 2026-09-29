const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(p, "utf8");

// 1) latency ref 加 mute/reRecord
const latOld = `  const latencyRef = useRef<{ asr: number[]; firstToken: number[]; firstAudio: number[] }>(
    { asr: [], firstToken: [], firstAudio: [] },
  );`;
const latNew = `  const latencyRef = useRef<{
    asr: number[]; firstToken: number[]; firstAudio: number[]; mute: number[]; reRecord: number[];
  }>(
    { asr: [], firstToken: [], firstAudio: [], mute: [], reRecord: [] },
  );
  const stopRequestedRef = useRef(false);`;
if (!s.includes(latOld)) throw new Error("latency anchor missing");
s = s.replace(latOld, latNew);

// 2) 历史构建纳入 interrupted 已播前缀
const histOld = `      const allMsgs: ChatMsg[] = [
        ...turns.filter((t) => t.status === "completed" || t.role === "user"),
        userTurn,
      ].map((t) => ({ role: t.role, content: t.text }));`;
const histNew = `      const allMsgs: ChatMsg[] = [
        ...turns.filter((t) => t.role === "user" || t.status === "completed"
          || (t.status === "interrupted" && !!t.committedText)),
        userTurn,
      ].map((t) => ({
        role: t.role,
        content: t.role === "assistant" && t.status === "interrupted" ? t.committedText : t.text,
      }));`;
if (!s.includes(histOld)) throw new Error("history build anchor missing");
s = s.replace(histOld, histNew);

// 3) for-await 可打断 + 中断收尾
const loopOld = `      let full = "";
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
      });
      if (correction) {
        userTurn = await api.convUpdateTurn({ turnKey: userKey, localFeedback: [correction] });
      }`;
const loopNew = `      let full = "";
      let firstTokenSeen = false;
      const stream = localEngine.stream(messages, { maxTokens: 220 });
      stopRequestedRef.current = false;
      for await (const chunk of stream) {
        full = chunk.text; setStreaming(chunk.text);
        if (!firstTokenSeen && chunk.text.trim()) {
          firstTokenSeen = true;
          latencyRef.current.firstToken.push(Math.round(performance.now() - genT0));
        }
        speaker.feed(chunk.text);
        if (stopRequestedRef.current) break;
      }
      setStreaming("");
      let playedCharEnd = 0;
      let interruptedNow = false;
      if (stopRequestedRef.current) {
        playedCharEnd = speaker.stop(); // 已静音，冻结已播游标
        speakerRef.current = null;
        interruptedNow = true;
      } else {
        await speaker.end();
        playedCharEnd = speaker.playedCharEnd;
        speakerRef.current = null;
      }
      const { reply, correction } = parseCorrection(full);
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
        userTurn = await api.convUpdateTurn({ turnKey: userKey, localFeedback: [correction] });
      }`;
if (!s.includes(loopOld)) throw new Error("stream loop anchor missing");
s = s.replace(loopOld, loopNew);

// 4) interruptPlayback handler（插在 confirmAsr 之后）
const confirmAnchor = `  const confirmAsr = () => {
    const t = asrDraft.trim();
    if (!t) return;
    setAsrDraft("");
    void send(t);
  };
`;
if (!s.includes(confirmAnchor)) throw new Error("confirmAsr anchor missing");
const interruptFn = `
  const interruptPlayback = () => {
    if (!busy) return;
    const t0 = performance.now();
    stopRequestedRef.current = true;
    if (speakerRef.current) speakerRef.current.stop(); // 立即静音
    localEngine.interrupt(); // 通知引擎停止，后台收敛
    latencyRef.current.mute.push(Math.round(performance.now() - t0));
    const reT0 = performance.now();
    const tick = setInterval(() => {
      if (!busy) {
        clearInterval(tick);
        latencyRef.current.reRecord.push(Math.round(performance.now() - reT0));
      }
    }, 30);
  };
`;
s = s.replace(confirmAnchor, confirmAnchor + interruptFn);

// 5) header 打断按钮
const headOld = `        <button className="btn-primary conv-end" disabled={busy} onClick={() => { void endSession(); }}>
          {ending ? "复盘中…" : "结束并复盘"}
        </button>`;
const headNew = `        <button className="ghost2" disabled={!busy} onClick={interruptPlayback}>打断</button>
        <button className="btn-primary conv-end" disabled={busy} onClick={() => { void endSession(); }}>
          {ending ? "复盘中…" : "结束并复盘"}
        </button>`;
if (!s.includes(headOld)) throw new Error("header end button anchor missing");
s = s.replace(headOld, headNew);

// 6) 中断气泡只显示已播前缀
const bubbleOld = `                {text || (isLive ? "…" : "")}
                {t.status === "failed" && <em className="err-text">（生成失败：{t.errorCode}）</em>}`;
const bubbleNew = `                {t.status === "interrupted"
                  ? (t.committedText || "")
                  : text || (isLive ? "…" : "")}
                {t.status === "interrupted" && <em className="muted">（已打断）</em>}
                {t.status === "failed" && <em className="err-text">（生成失败：{t.errorCode}）</em>}`;
if (!s.includes(bubbleOld)) throw new Error("bubble anchor missing");
s = s.replace(bubbleOld, bubbleNew);

// 7) endSession 历史也纳入已播前缀
const sumOld = `      const convoAll: ChatMsg[] = turns
        .filter((t) => t.role === "user" || (t.role === "assistant" && t.status === "completed"))
        .map((t) => ({ role: t.role, content: t.text }));`;
const sumNew = `      const convoAll: ChatMsg[] = turns
        .filter((t) => t.role === "user" || t.status === "completed"
          || (t.status === "interrupted" && !!t.committedText))
        .map((t) => ({
          role: t.role,
          content: t.role === "assistant" && t.status === "interrupted" ? t.committedText : t.text,
        }));`;
if (!s.includes(sumOld)) throw new Error("endSession history anchor missing");
s = s.replace(sumOld, sumNew);

fs.writeFileSync(p, s);
console.log("ConversationPage interrupt wired");
