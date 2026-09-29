// S9-2 修复：滚动监听挂到真正的滚动容器 .main（overflow-y:auto），window 不滚动
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "src", "App.tsx");
let s = fs.readFileSync(fp, "utf8");
const oldStr = `    const onHidden = () => { if (document.visibilityState === "hidden") void flushResume(curId); };
    const onUnload = () => { void flushResume(curId); };
    window.addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      disposed = true;
      if (resumeTimerRef.current != null) { window.clearTimeout(resumeTimerRef.current); resumeTimerRef.current = null; }
      window.removeEventListener("scroll", schedule);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onUnload);
      void flushResume(curId);
    };`;
const newStr = `    const onHidden = () => { if (document.visibilityState === "hidden") void flushResume(curId); };
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
    };`;
if (s.includes(newStr)) { console.log("skip"); }
else {
  if (!s.includes(oldStr)) throw new Error("锚点缺失");
  s = s.replace(oldStr, newStr);
  fs.writeFileSync(fp, s, "utf8");
  console.log("patched");
}
