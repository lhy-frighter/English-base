// S11-c App.tsx 接线：送句带来源、续练入口、今日卡、ShadowPage props
const fs = require("fs");
const fp = "src/App.tsx";
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

// 1) send 类型 + sendToShadow 带来源 + 续练 nonce
rep(
`  const [shadowSend, setShadowSend] = useState<{ text: string; nonce: number } | null>(null);
  const nonceRef = useRef(createNonce());
  const sendToShadow = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setShadowSend({ text: t, nonce: nonceRef.current() });
    setTab("shadow");
  };`,
`  const [shadowSend, setShadowSend] = useState<{ text: string; nonce: number; textId?: number; title?: string } | null>(null);
  const nonceRef = useRef(createNonce());
  const sendToShadow = (text: string, textId?: number, title?: string) => {
    const t = text.trim();
    if (!t) return;
    setShadowSend({ text: t, nonce: nonceRef.current(), textId, title });
    setTab("shadow");
  };
  // S11-c 跟读续练（1/3/7 到期句队列）
  const [shadowReviewNonce, setShadowReviewNonce] = useState(0);
  const openShadowReview = () => { setShadowReviewNonce((n) => n + 1); setTab("shadow"); };
  const refreshToday = useCallback(() => { void api.todayBrief().then(setToday).catch(() => {}); }, []);`,
"send 类型与续练 state");

// 2) 阅读页送跟读按钮带来源文章
rep(
`                <button className="primary" onClick={() => sendToShadow(selText)}>送跟读 →</button>`,
`                <button className="primary" onClick={() => sendToShadow(selText, ann?.text_id, ann?.title)}>送跟读 →</button>`,
"送跟读按钮来源");

// 3) 今日页次级卡：跟读续练（放在错题卡之后、漏网词之前）
rep(
`                    {today.wrong_due > 0 && (
                      <button className="tcard" onClick={() => setTab("exam")}>
                        <b>错题复习</b>
                        <span>{today.wrong_due} 道错题到期重做</span>
                      </button>
                    )}`,
`                    {today.wrong_due > 0 && (
                      <button className="tcard" onClick={() => setTab("exam")}>
                        <b>错题复习</b>
                        <span>{today.wrong_due} 道错题到期重做</span>
                      </button>
                    )}
                    {(today.shadow_due ?? 0) > 0 && (
                      <button className="tcard" onClick={openShadowReview}>
                        <b>跟读续练</b>
                        <span>{today.shadow_due} 句跟读到期重练（1/3/7）</span>
                      </button>
                    )}`,
"今日跟读续练卡");

// 4) ShadowPage props
rep(
`        {tab === "shadow" && <ShadowPage send={shadowSend} />}`,
`        {tab === "shadow" && <ShadowPage send={shadowSend} reviewNonce={shadowReviewNonce} onPracticed={refreshToday} />}`,
"ShadowPage props");

fs.writeFileSync(fp, s, "utf8");
console.log("App.tsx saved");
