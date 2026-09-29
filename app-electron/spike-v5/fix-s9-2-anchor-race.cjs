// S9-2 修复 2：锚点按文章缓存，cleanup/隐藏时用缓存而非实时 DOM，避免 A 文章断点写成 B 的位置
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "src", "App.tsx");
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(a, b, label) {
  if (s.includes(b)) { console.log("skip:", label); return; }
  if (!s.includes(a)) throw new Error("锚点缺失: " + label);
  s = s.replace(a, b); n++; console.log("patched:", label);
}

rep("  const resumeSavedRef = useRef<{ pi: number; ch: number } | null>(null);",
    "  const anchorMapRef = useRef<Map<number, { pi: number; ch: number }>>(new Map());",
"ref 声明");

rep(`  const flushResume = useCallback(async (textId: number) => {
    const a = computeAnchor();
    if (!a) return;
    const last = resumeSavedRef.current;
    if (last && last.pi === a.pi && last.ch === a.ch) return;
    const para = readerParas[a.pi] ?? "";
    const hash = para ? await sha256Hex(para) : "";
    try {
      await api.resumePut("reading", String(textId), { pi: a.pi, ch: a.ch }, hash);
      resumeSavedRef.current = a;
    } catch { /* 位置保存失败不阻塞阅读 */ }
  }, [computeAnchor, readerParas]);`,
`  const flushResume = useCallback(async (textId: number, cached?: { pi: number; ch: number }) => {
    const a = cached ?? anchorMapRef.current.get(textId) ?? computeAnchor();
    if (!a) return;
    const para = readerParas[a.pi] ?? "";
    const hash = para ? await sha256Hex(para) : "";
    try {
      await api.resumePut("reading", String(textId), { pi: a.pi, ch: a.ch }, hash);
    } catch { /* 位置保存失败不阻塞阅读 */ }
  }, [computeAnchor, readerParas]);`,
"flushResume");

rep(`    resumeSavedRef.current = null;
    resumeSkipRef.current = false;
    resumeRestoredRef.current = null;
    let disposed = false;
    const curId = annTextId;
    const schedule = () => {
      if (resumeTimerRef.current != null) return;
      resumeTimerRef.current = window.setTimeout(() => {
        resumeTimerRef.current = null;
        if (!disposed) void flushResume(curId);
      }, 5000);
    };
    const onHidden = () => { if (document.visibilityState === "hidden") void flushResume(curId); };
    const onUnload = () => { void flushResume(curId); };
    // 实际滚动容器是 .main（flex+overflow-y:auto），window 本身不滚动；找不到时退回 window
    const scroller = document.querySelector<HTMLElement>(".main") ?? window;
    scroller.addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      disposed = true;
      if (resumeTimerRef.current != null) { window.clearTimeout(resumeTimerRef.current); resumeTimerRef.current = null; }
      scroller.removeEventListener("scroll", schedule);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onUnload);
      void flushResume(curId);
    };`,
`    resumeSkipRef.current = false;
    resumeRestoredRef.current = null;
    let disposed = false;
    const curId = annTextId;
    const onScroll = () => {
      const a = computeAnchor();
      if (a) anchorMapRef.current.set(curId, a);
      if (resumeTimerRef.current != null) return;
      resumeTimerRef.current = window.setTimeout(() => {
        resumeTimerRef.current = null;
        if (!disposed) void flushResume(curId, anchorMapRef.current.get(curId));
      }, 5000);
    };
    const onHidden = () => { if (document.visibilityState === "hidden") void flushResume(curId, anchorMapRef.current.get(curId)); };
    const onUnload = () => { void flushResume(curId, anchorMapRef.current.get(curId)); };
    // 实际滚动容器是 .main（flex+overflow-y:auto），window 本身不滚动；找不到时退回 window
    const scroller = document.querySelector<HTMLElement>(".main") ?? window;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      disposed = true;
      if (resumeTimerRef.current != null) { window.clearTimeout(resumeTimerRef.current); resumeTimerRef.current = null; }
      scroller.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onUnload);
      // 切文章/回书库：用本文缓存的最后锚点立即补落（此时 DOM 可能已是新文章）
      void flushResume(curId, anchorMapRef.current.get(curId));
      anchorMapRef.current.delete(curId);
    };`,
"追踪 effect");

fs.writeFileSync(fp, s, "utf8");
console.log("完成", n);
