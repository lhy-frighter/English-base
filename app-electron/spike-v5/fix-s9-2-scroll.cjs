// S9-2 修复 3：恢复时显式设置 .main 的 scrollTop（scrollIntoView 在多滚动祖先+overflow:hidden 下可能失效）
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

// 1) computeAnchor 之前插入显式滚动工具
rep("  const computeAnchor = useCallback(() => {",
`  // 显式滚动 .main 到指定段（比 scrollIntoView 在嵌套滚动容器下更确定）
  const scrollToPara = useCallback((el: HTMLElement) => {
    const scroller = document.querySelector<HTMLElement>(".main");
    if (scroller) {
      const base = scroller.getBoundingClientRect().top + 12;
      scroller.scrollTop += el.getBoundingClientRect().top - base;
    } else {
      el.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }, []);

  const computeAnchor = useCallback(() => {`,
"scrollToPara 工具");

// 2) 恢复处用显式滚动
rep(`        el.scrollIntoView({ block: "start", behavior: "auto" });
        resumeRestoredRef.current = { id: annTextId, pi, reanchored: false };
        setResumeNotice(\`已恢复到上次阅读位置（第 \${pi + 1} 段）\`);`,
`        scrollToPara(el);
        // 二次校准：等版面（译文/字体）稳定后再对齐一次
        window.setTimeout(() => { if (!cancelled) scrollToPara(el); }, 600);
        resumeRestoredRef.current = { id: annTextId, pi, reanchored: false };
        console.info("[resume] restore", { textId: annTextId, pi, ch: r.locator?.ch });
        setResumeNotice(\`已恢复到上次阅读位置（第 \${pi + 1} 段）\`);`,
"恢复滚动");

// 3) 机翻到达后的重新归位也用显式滚动
rep(`    if (el) { el.scrollIntoView({ block: "start", behavior: "auto" }); rr.reanchored = true; }`,
`    if (el) { scrollToPara(el); rr.reanchored = true; }`,
"重归位");

// 4) 诊断：记录/元素缺失分支打点，便于定位
rep(`        if (cancelled || !r || r.refId !== String(annTextId)) return;
        const pi = Number(r.locator?.pi ?? 0);
        const para = readerParas[pi] ?? "";
        const el = readerRef.current?.querySelector<HTMLElement>(\`p[data-pi="\${pi}"]\`);
        if (!el || !para) return;`,
`        if (cancelled) return;
        if (!r) { console.info("[resume] no row"); return; }
        if (r.refId !== String(annTextId)) { console.info("[resume] ref mismatch", r.refId, annTextId); return; }
        const pi = Number(r.locator?.pi ?? 0);
        const para = readerParas[pi] ?? "";
        const el = readerRef.current?.querySelector<HTMLElement>(\`p[data-pi="\${pi}"]\`);
        if (!el || !para) { console.warn("[resume] anchor missing", { pi, hasEl: !!el, hasPara: !!para }); return; }`,
"诊断打点");

fs.writeFileSync(fp, s, "utf8");
console.log("完成", n);
