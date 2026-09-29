const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(p, "utf8");

function mustReplace(str, oldStr, newStr, label) {
  if (!str.includes(oldStr)) throw new Error("anchor missing: " + label);
  return str.replace(oldStr, newStr);
}

// 1) imports：加 cloudEngine
s = mustReplace(
  s,
  `import { localEngine, CURRENT_MODEL } from "./runtime";`,
  `import { localEngine, cloudEngine, CURRENT_MODEL } from "./runtime";`,
  "runtime import",
);

// 2) 设置页副标题
s = mustReplace(
  s,
  `<span className="muted">本地大脑陪练 · 设定话题与难度，逐轮轻纠错，结束有复盘</span>`,
  `<span className="muted">云端 / 本地大脑可切换 · 设定话题与难度，逐轮轻纠错，结束有复盘</span>`,
  "setup subtitle",
);

// 3) engine 状态
s = mustReplace(
  s,
  `  const [formTurns, setFormTurns] = useState(8);
`,
  `  const [formTurns, setFormTurns] = useState(8);
  // V8-4 引擎选择：云端默认，本地可选
  const [engine, setEngine] = useState<"cloud" | "local">("cloud");
`,
  "engine state",
);

// 4) ensureEngine 先拿 LLM 租约
s = mustReplace(
  s,
  `    setEnginePhase("loading"); setLoadPct(0);
    try {
      await localEngine.load(CURRENT_MODEL, (p: unknown) => {`,
  `    setEnginePhase("loading"); setLoadPct(0);
    try {
      await inference.acquire("llm");
      await localEngine.load(CURRENT_MODEL, (p: unknown) => {`,
  "ensureEngine lease",
);

// 5) startSession 按引擎记录
s = mustReplace(
  s,
  `      brainEngine: "local", brainModelRevision: CURRENT_MODEL,`,
  `      brainEngine: engine, brainModelRevision: engine === "local"
        ? CURRENT_MODEL : (cloud?.model || "glm-4.7-flash"),`,
  "startSession brain",
);

// 6) 打断作用于当前引擎
s = mustReplace(
  s,
  `    localEngine.interrupt(); // 通知引擎停止，后台收敛`,
  `    (engine === "cloud" ? cloudEngine : localEngine).interrupt(); // 通知当前引擎停止，后台收敛`,
  "interrupt active engine",
);

// 7) 替换整个 send 为 send + runGeneration + retryFailedTurn
const startMarker = "  const send = async (textArg?: string) => {";
const endMarker = "  const endSession = async () => {";
const i0 = s.indexOf(startMarker);
const i1 = s.indexOf(endMarker);
if (i0 < 0 || i1 < 0 || i1 < i0) throw new Error("send block markers missing");

const newBlock = `  const send = async (textArg?: string) => {
    const text = (textArg ?? input).trim();
    if (!text || busy || !session) return;
    // 云端前置校验：必须已授权历史文本、已保存 key
    if (engine === "cloud") {
      if (!cloud?.historyText) { setCloudMsg("云端对话需先在云端设置中勾选「上传历史对话文本」"); return; }
      if (!keySet) { setCloudMsg("请先在云端设置中保存 API Key"); return; }
    }
    setBusy(true); setInput(""); setAsrDraft(""); setMicErr(""); setCloudMsg("");
    const userKey = \`turn:\${crypto.randomUUID()}\`;
    const asstKey = \`turn:\${crypto.randomUUID()}\`;
    const modelRev = engine === "local" ? CURRENT_MODEL : (cloud?.model || "");
    const userTurn = await api.convAddTurn({
      sessionKey: session.sessionKey, turnKey: userKey, role: "user", text, status: "user_confirmed",
    });
    const asstTurn = await api.convAddTurn({
      sessionKey: session.sessionKey, turnKey: asstKey, role: "assistant", text: "",
      status: "generating", provider: engine, modelRevision: modelRev,
    });
    setTurns((prev) => [...prev, userTurn, asstTurn]);
    await runGeneration(asstKey, undefined, userTurn);
  };

  // 通用生成流程：本地/云端同构；extraUser 为本次刚落库的用户轮（state 尚未刷新时使用）。
  const runGeneration = async (
    asstKey: string,
    kindOverride?: "cloud" | "local",
    extraUser?: ConvTurn,
  ) => {
    try {
      const useCloud = (kindOverride ?? engine) === "cloud";
      const activeEngine = useCloud ? cloudEngine : localEngine;
      if (useCloud) {
        if (inference.llmActive) await inference.release("llm"); // 云端发送前卸载本地大脑
        setEnginePhase("ready");
      } else {
        await ensureEngine();
      }
      const baseTurns = extraUser ? [...turns, extraUser] : turns;
      const allMsgs: ChatMsg[] = [
        ...baseTurns.filter((t) => t.role === "user" || t.status === "completed"
          || (t.status === "interrupted" && !!t.committedText)),
      ].map((t) => ({
        role: t.role,
        content: t.role === "assistant" && t.status === "interrupted" ? t.committedText : t.text,
      }));
      const { window: win, overflow } = selectWindow(allMsgs);
      if (overflow.length) {
        // 旧轮次压缩为运行摘要（仅提示上下文；原始轮次仍以数据库为准）
        setCompacting(true);
        const summaryMessages = [
          { role: "system", content: SUMMARY_SYSTEM_PROMPT },
          { role: "user", content: summaryUserMessage(summaryRef.current, overflow) },
        ];
        let sText = "";
        const summaryStream = activeEngine.stream(summaryMessages as any, { temperature: 0.2, maxTokens: 180 });
        for await (const chunk of summaryStream) sText = chunk.text;
        summaryRef.current = sText.trim();
        setCompacting(false);
      }
      const messages = [
        { role: "system", content: systemPrompt(session!.topic) },
        ...(summaryRef.current
          ? [{ role: "system", content: \`Earlier conversation summary (for context only):\\n\${summaryRef.current}\` }]
          : []),
        ...win,
      ];
      const genT0 = performance.now();
      const speaker = startStreamingSpeaker({
        enabled: voiceOn,
        onFirstAudio: () => latencyRef.current.firstAudio.push(Math.round(performance.now() - genT0)),
        onPhase: (ph) => setSpeakPhase(ph),
      });
      speakerRef.current = speaker;
      let full = "";
      let firstTokenSeen = false;
      stopRequestedRef.current = false;
      const gen = activeEngine.stream(messages as any, { maxTokens: 220 });
      for await (const chunk of gen) {
        full = chunk.text; setStreaming(chunk.text);
        if (!firstTokenSeen && chunk.text.trim()) {
          firstTokenSeen = true;
          latencyRef.current.firstToken.push(Math.round(performance.now() - genT0));
        }
        speaker.feed(chunk.text);
        if (stopRequestedRef.current) break;
      }
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
      }
      setTurns((prev) => prev.map((t) => (t.turnKey === asstKey ? asstTurn : t)));
      setStreaming("");
    } catch (e) {
      setStreaming("");
      setCompacting(false);
      if (speakerRef.current) { speakerRef.current.stop(); speakerRef.current = null; setSpeakPhase("idle"); }
      const code = (e as Error).message?.slice(0, 120) || "unknown";
      const asstTurn = await api.convUpdateTurn({ turnKey: asstKey, status: "failed", errorCode: code })
        .catch(() => null);
      if (asstTurn) setTurns((prev) => prev.map((t) => (t.turnKey === asstKey ? asstTurn : t)));
    } finally {
      setBusy(false);
    }
  };

  // 云端失败后：云端重试或切本地重试（复用失败的 assistant 轮，不新增轮次）。
  const retryFailedTurn = async (useLocal: boolean) => {
    if (!session || busy) return;
    const failed = [...turns].reverse().find((t) => t.role === "assistant" && t.status === "failed");
    if (!failed) return;
    if (!useLocal && (!cloud?.historyText || !keySet)) {
      setCloudMsg("云端重试需先勾选「上传历史对话文本」并保存 key");
      return;
    }
    const kind: "cloud" | "local" = useLocal ? "local" : "cloud";
    setEngine(kind);
    setBusy(true); setCloudMsg("");
    const modelRev = useLocal ? CURRENT_MODEL : (cloud?.model || "");
    const reset = await api.convUpdateTurn({
      turnKey: failed.turnKey, status: "generating", errorCode: "",
      provider: kind, modelRevision: modelRev,
    });
    setTurns((prev) => prev.map((t) => (t.turnKey === failed.turnKey ? reset : t)));
    await runGeneration(failed.turnKey, kind);
  };

`;
s = s.slice(0, i0) + newBlock + s.slice(i1);

// 8) 设置页：引擎选择
s = mustReplace(
  s,
  `          <div className="conv-form card">
            <h3>开始新对话</h3>
            <label className="conv-label">话题目标</label>`,
  `          <div className="conv-form card">
            <h3>开始新对话</h3>
            <label className="conv-label">对话引擎</label>
            <div className="seg">
              <button className={engine === "cloud" ? "seg-on" : ""} onClick={() => setEngine("cloud")}>云端 GLM</button>
              <button className={engine === "local" ? "seg-on" : ""} onClick={() => setEngine("local")}>本地 3B</button>
            </div>
            <label className="conv-label">话题目标</label>`,
  "setup engine selector",
);

// 9) 云端卡片文案
s = mustReplace(
  s,
  `              <h3>云端设置（可选）</h3>
              <p className="muted conv-cloud-note">
                默认完全离线，本地大脑失败不会自动联网。只有你逐项授权后，对应数据才会发送；授权可随时在此关闭。
              </p>`,
  `              <h3>云端设置</h3>
              <p className="muted conv-cloud-note">
                云端为默认引擎；失败不会自动联网兜底。只有你逐项授权后，对应数据才会发送；授权可随时在此关闭。
              </p>`,
  "cloud card copy",
);

// 10) 模型名输入框（端点之后、key 之前）
s = mustReplace(
  s,
  `                  api.cloudSaveConsent(next).catch(() => {});
                }}
              />
              <label className="conv-label">API Key{keySet ? "（已加密保存）" : ""}</label>`,
  `                  api.cloudSaveConsent(next).catch(() => {});
                }}
              />
              <label className="conv-label">模型名</label>
              <input
                className="conv-input"
                value={cloud.model}
                placeholder="glm-4.7-flash"
                onChange={(e) => {
                  const next = { ...cloud, model: e.target.value, updatedAt: Date.now() };
                  setCloud(next);
                  api.cloudSaveConsent(next).catch(() => {});
                }}
              />
              <label className="conv-label">API Key{keySet ? "（已加密保存）" : ""}</label>`,
  "model name input",
);

// 11) header 引擎切换
s = mustReplace(
  s,
  `        <button
          className="ghost2 conv-voice-toggle"`,
  `        <div className="seg conv-engine-seg">
          <button className={engine === "cloud" ? "seg-on" : ""} disabled={busy} onClick={() => setEngine("cloud")}>云端</button>
          <button className={engine === "local" ? "seg-on" : ""} disabled={busy} onClick={() => setEngine("local")}>本地</button>
        </div>
        <button
          className="ghost2 conv-voice-toggle"`,
  "header engine switch",
);

// 12) 失败气泡重试按钮
s = mustReplace(
  s,
  `                {t.status === "failed" && <em className="err-text">（生成失败：{t.errorCode}）</em>}
              </div>
            </div>
          );`,
  `                {t.status === "failed" && <em className="err-text">（生成失败：{t.errorCode}）</em>}
              </div>
              {t.status === "failed" && (
                <div className="conv-retry">
                  <button className="ghost2" onClick={() => { void retryFailedTurn(false); }}>云端重试</button>
                  <button className="ghost2" onClick={() => { void retryFailedTurn(true); }}>切本地重试</button>
                </div>
              )}
            </div>
          );`,
  "failed retry buttons",
);

fs.writeFileSync(p, s);
console.log("ConversationPage V8-4 wiring applied");
