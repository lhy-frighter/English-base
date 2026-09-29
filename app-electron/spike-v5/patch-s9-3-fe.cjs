// S9-3 前端：今日 tab + 唯一主按钮 + 次级入口
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const fp = path.join(root, "src", "App.tsx");
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}

// 1) 类型导入
rep('type TextSourceKind } from "./api";',
    'type TextSourceKind, type TodayBrief } from "./api";',
"类型导入");

// 2) tab 联合类型加 today，默认进今日
rep('const [tab, setTab] = useState<"read" | "feed" | "review" | "shadow" | "lex" | "syl" | "exam" | "dash" | "voice">("read");',
    'const [tab, setTab] = useState<"today" | "read" | "feed" | "review" | "shadow" | "lex" | "syl" | "exam" | "dash" | "voice">("today");',
"tab 默认");

// 3) today 状态（跟 counts 一起）
rep('  const [counts, setCounts] = useState<Counts | null>(null);',
    '  const [counts, setCounts] = useState<Counts | null>(null);\n  const [today, setToday] = useState<TodayBrief | null>(null);',
"today 状态");

// 4) 刷新方法（refreshCounts 之后）
rep(`  const refreshCounts = useCallback(async () => {
    try { setCounts(await api.counts()); } catch (e) { setErr(String(e)); }
  }, []);`,
`  const refreshCounts = useCallback(async () => {
    try { setCounts(await api.counts()); } catch (e) { setErr(String(e)); }
  }, []);
  const refreshToday = useCallback(async () => {
    try { setToday(await api.todayBrief()); } catch { /* 今日页留空，不阻塞 */ }
  }, []);`,
"refreshToday");

// 5) 进入今日页时刷新（放在 refreshCounts 定义后；用 tab 依赖 effect，找阅读会话 effect 前插入不便，直接挂在 refreshToday 后）
rep(`  const refreshToday = useCallback(async () => {
    try { setToday(await api.todayBrief()); } catch { /* 今日页留空，不阻塞 */ }
  }, []);`,
`  const refreshToday = useCallback(async () => {
    try { setToday(await api.todayBrief()); } catch { /* 今日页留空，不阻塞 */ }
  }, []);
  useEffect(() => { if (tab === "today") void refreshToday(); }, [tab, refreshToday]);`,
"today 刷新 effect");

// 6) 主按钮调度（startReview 之后）
rep(`  const startReview = useCallback(async () => {
    setErr(""); setShowBack(false); setLastResult("");
    try {
      const q = await api.getDue(10);
      setQueue(q); setQueueTotal(q.length);
    } catch (e) { setErr(String(e)); }
  }, []);`,
`  const startReview = useCallback(async () => {
    setErr(""); setShowBack(false); setLastResult("");
    try {
      const q = await api.getDue(10);
      setQueue(q); setQueueTotal(q.length);
    } catch (e) { setErr(String(e)); }
  }, []);

  // S9-3 今日页唯一主按钮：①到期/新卡→复习 ②无卡有断点→继续精读 ③都没有→好文
  const todayPrimary = useCallback(async () => {
    const b = today ?? await api.todayBrief();
    if (b.primary === "review") { setTab("review"); await startReview(); }
    else if (b.primary === "reading" && b.resume) { setTab("read"); await openSaved(Number(b.resume.refId)); }
    else setTab("feed");
  }, [today, startReview, openSaved]);`,
"todayPrimary");

// 7) 导航首位加今日
rep(`        <nav className="nav">
          <button className={tab === "read" ? "nav-item active" : "nav-item"} onClick={() => { setTab("read"); if (ann) setAnn(ann); }}>
            <span>阅读</span>
          </button>`,
`        <nav className="nav">
          <button className={tab === "today" ? "nav-item active" : "nav-item"} onClick={() => setTab("today")}>
            <span>今日</span>
          </button>
          <button className={tab === "read" ? "nav-item active" : "nav-item"} onClick={() => { setTab("read"); if (ann) setAnn(ann); }}>
            <span>阅读</span>
          </button>`,
"导航");

// 8) 今日页 JSX（书库块之前）
const block = fs.readFileSync(path.join(__dirname, "s9-3-today.txt"), "utf8");
rep(`        {/* ============ 阅读：书库 ============ */}`,
    block + `        {/* ============ 阅读：书库 ============ */}`,
"今日页 JSX");

fs.writeFileSync(fp, s, "utf8");
console.log("完成", n);
