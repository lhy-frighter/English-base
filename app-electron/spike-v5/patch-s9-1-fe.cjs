// S9-1 前端接线：App.tsx 阅读会话、ShadowPage.tsx 跟读会话
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
let n = 0;
function patch(rel, oldStr, newStr, label) {
  const fp = path.join(root, rel);
  let s = fs.readFileSync(fp, "utf8");
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("未找到锚点 [" + rel + "]: " + label);
  fs.writeFileSync(fp, s.replace(oldStr, newStr), "utf8");
  n++; console.log("patched:", label);
}

// —— App.tsx ——
patch("src/App.tsx",
'import ShadowPage from "./shadow/ShadowPage";',
'import ShadowPage from "./shadow/ShadowPage";\nimport { SessionTracker } from "./learning-session";',
"App import");

// 在 backToLibrary 定义之前插入 ref + 会话 effect（锚点用其注释行）
patch("src/App.tsx",
"  const backToLibrary = useCallback(() => {",
`  // S9-1 阅读会话：打开文章开始计时（仅前台可见），切文章/回书库/卸载时关闭；杀进程由主进程回收兜底
  const readSessionRef = useRef<SessionTracker | null>(null);
  if (!readSessionRef.current) readSessionRef.current = new SessionTracker();
  const annTextId = ann?.text_id ?? null;
  useEffect(() => {
    const tr = readSessionRef.current!;
    if (annTextId == null) { void tr.stop(); return; }
    const title = (rawText || "").trim().split(/\\n/)[0]?.slice(0, 60) || \`文章 #\${annTextId}\`;
    void tr.start("read", {
      refType: "text", refId: String(annTextId), titleSnapshot: title,
      unit: "words", amount: ann?.stats.words ?? 0,
    });
    return () => { void tr.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annTextId]);

  const backToLibrary = useCallback(() => {`,
"App 阅读会话 effect");

// —— ShadowPage.tsx ——
patch("src/shadow/ShadowPage.tsx",
'import { useEffect, useRef, useState } from "react";',
'import { useEffect, useRef, useState } from "react";\nimport { SessionTracker } from "../learning-session";',
"Shadow import");

patch("src/shadow/ShadowPage.tsx",
"  useEffect(() => () => { // 卸载：停麦并释放当前 Blob URL\n    streamRef.current?.getTracks().forEach((t) => t.stop());\n    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);\n  }, []);",
`  // S9-1 跟读会话：进入跟读台开始计时（仅前台可见），卸载关闭；每完成一次比对 amount+1
  const sessionRef = useRef<SessionTracker | null>(null);
  if (!sessionRef.current) sessionRef.current = new SessionTracker();
  useEffect(() => {
    const tr = sessionRef.current!;
    void tr.start("shadow", { refType: "shadow_page", refId: "shadow", titleSnapshot: "跟读台", unit: "sentences", amount: 0 });
    return () => { void tr.stop(); };
  }, []);

  useEffect(() => () => { // 卸载：停麦并释放当前 Blob URL
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);`,
"Shadow 会话 effect");

patch("src/shadow/ShadowPage.tsx",
"          setRes(alignRead(snap, r.words));\n          setPhase(\"done\");",
"          setRes(alignRead(snap, r.words));\n          sessionRef.current?.bumpAmount(1);\n          setPhase(\"done\");",
"Shadow 句数累计");

console.log("完成", n);
