const fs = require("fs");
const fp = "src/App.tsx";
let s = fs.readFileSync(fp, "utf8");
let n = 0;

// 1) baseline ref
if (!s.includes("readBaselineRef")) {
  const anchor = `  const readSessionRef = useRef<SessionTracker | null>(null);
  if (!readSessionRef.current) readSessionRef.current = new SessionTracker();`;
  if (!s.includes(anchor)) throw new Error("ref anchor missing");
  s = s.replace(anchor, anchor + `
  const readBaselineRef = useRef(0); // 本次打开时的阅读起点（词偏移），只统计向前推进的词`);
  n++;
}

// 2) wordsUpToAnchor（放在 readerParas 之后）
if (!s.includes("wordsUpToAnchor")) {
  const anchor = `  const readerParas = useMemo(() => (ann ? paragraphsFromAnn(ann, rawText) : []), [ann, rawText]);`;
  if (!s.includes(anchor)) throw new Error("paras anchor missing");
  s = s.replace(anchor, anchor + `

  // 从文章开头到锚点（段 pi + 段内字符 ch）累计了多少词
  const wordsUpToAnchor = useCallback((a: { pi: number; ch: number }) => {
    const countW = (sx: string) => (sx.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
    let cnt = 0;
    for (let i = 0; i < a.pi && i < readerParas.length; i++) cnt += countW(readerParas[i] || "");
    cnt += countW((readerParas[a.pi] || "").slice(0, a.ch));
    return cnt;
  }, [readerParas]);`);
  n++;
}

// 3) 会话启动：amount 0 + 基线读取
{
  const anchor = `    void tr.start("read", {
      refType: "text", refId: String(annTextId), titleSnapshot: title,
      unit: "words", amount: ann?.stats.words ?? 0,
    });
    return () => { void tr.stop(); };`;
  if (s.includes(anchor)) {
    s = s.replace(anchor, `    readBaselineRef.current = 0;
    let cancelled = false;
    void tr.start("read", {
      refType: "text", refId: String(annTextId), titleSnapshot: title,
      unit: "words", amount: 0,
    });
    // 基线 = 断点续学锚点位置；本次只统计从基线向前推进的词
    (async () => {
      try {
        const r = await api.resumeGet("reading");
        if (cancelled || !r || r.refId !== String(annTextId)) return;
        readBaselineRef.current = wordsUpToAnchor({
          pi: Number(r.locator?.pi ?? 0), ch: Number(r.locator?.ch ?? 0),
        });
      } catch { /* 基线保持 0 */ }
    })();
    return () => { cancelled = true; void tr.stop(); };`);
    n++;
  }
}

// 4) onScroll 上报推进词数
{
  const anchor = `    const onScroll = () => {
      const a = computeAnchor();
      if (a) anchorMapRef.current.set(curId, a);`;
  if (s.includes(anchor)) {
    s = s.replace(anchor, `    const reportProgress = (a: { pi: number; ch: number }) => {
      readSessionRef.current?.setAmount(
        Math.max(0, wordsUpToAnchor(a) - readBaselineRef.current));
    };
    const onScroll = () => {
      const a = computeAnchor();
      if (a) { anchorMapRef.current.set(curId, a); reportProgress(a); }`);
    n++;
  }
}

// 5) 初始可见区域（打开不滚动也计数）+ 清理 + 依赖
{
  const anchor = `    scroller.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onUnload);`;
  if (s.includes(anchor)) {
    s = s.replace(anchor, `    scroller.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onUnload);
    const initH = window.setTimeout(() => { const a = computeAnchor(); if (a) reportProgress(a); }, 500);`);
    n++;
  }
}
{
  const anchor = `    return () => {
      disposed = true;
      if (resumeTimerRef.current != null) { window.clearTimeout(resumeTimerRef.current); resumeTimerRef.current = null; }`;
  if (s.includes(anchor)) {
    s = s.replace(anchor, `    return () => {
      disposed = true;
      window.clearTimeout(initH);
      if (resumeTimerRef.current != null) { window.clearTimeout(resumeTimerRef.current); resumeTimerRef.current = null; }`);
    n++;
  }
}
{
  const anchor = `  }, [annTextId, flushResume]);`;
  if (s.includes(anchor)) {
    s = s.replace(anchor, `  }, [annTextId, flushResume, wordsUpToAnchor]);`);
    n++;
  }
}

fs.writeFileSync(fp, s, "utf8");
console.log("App read-amount wired, edits:", n);
