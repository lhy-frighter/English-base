// S9-2 前端接线：App.tsx 插入锚点追踪/恢复块、reader ref、toast、跳词优先标记；CSS toast
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
let n = 0;
function patch(rel, oldStr, newStr, label) {
  const fp = path.join(root, rel);
  let s = fs.readFileSync(fp, "utf8");
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失 [" + rel + "]: " + label);
  fs.writeFileSync(fp, s.replace(oldStr, newStr), "utf8");
  n++; console.log("patched:", label);
}

const block = fs.readFileSync(path.join(__dirname, "s9-2-fe.txt"), "utf8");

// 1) 追踪/恢复块插在 readerParas 之后
patch("src/App.tsx",
'  const readerParas = useMemo(() => (ann ? paragraphsFromAnn(ann, rawText) : []), [ann, rawText]);',
'  const readerParas = useMemo(() => (ann ? paragraphsFromAnn(ann, rawText) : []), [ann, rawText]);\n' + block,
"追踪恢复块");

// 2) 跳词效果设置跳过标记
patch("src/App.tsx",
`        if ((el.textContent || "").toLowerCase() === want) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });`,
`        if ((el.textContent || "").toLowerCase() === want) {
          resumeSkipRef.current = true;
          el.scrollIntoView({ block: "center", behavior: "smooth" });`,
"跳词优先");

// 3) reader div 加 ref + toast
patch("src/App.tsx",
'            <div className="reader" onMouseUp={() => {',
'            {resumeNotice && <div className="resume-toast">{resumeNotice}</div>}\n            <div className="reader" ref={readerRef} onMouseUp={() => {',
"reader ref + toast");

// 4) CSS
patch("src/styles.css",
".tkp { white-space: pre-wrap; }",
`.tkp { white-space: pre-wrap; }
.resume-toast {
  max-width: calc(70ch + 80px); margin: 0 auto 10px; padding: 8px 16px;
  border-radius: 999px; background: #eef4ff; border: 1px solid #c7d8f5;
  color: #2f4d8a; font-size: 13px; text-align: center; font-family: var(--sans);
}`,
"toast css");

console.log("完成", n);
