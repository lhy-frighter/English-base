// S9-2 封板：移除 console 诊断打点（恢复逻辑保留）
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "src", "App.tsx");
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(a, b, label) {
  if (!s.includes(a)) { console.log("skip/missing:", label); return; }
  s = s.replace(a, b); n++; console.log("patched:", label);
}
rep('        console.info("[resume] restore", { textId: annTextId, pi, ch: r.locator?.ch });\n', "", "restore info");
rep('        if (!r) { console.info("[resume] no row"); return; }\n        if (r.refId !== String(annTextId)) { console.info("[resume] ref mismatch", r.refId, annTextId); return; }',
    '        if (!r || r.refId !== String(annTextId)) return;', "no row/mismatch");
rep('        if (!el || !para) { console.warn("[resume] anchor missing", { pi, hasEl: !!el, hasPara: !!para }); return; }',
    '        if (!el || !para) return;', "anchor missing");
fs.writeFileSync(fp, s, "utf8");
console.log("完成", n);
