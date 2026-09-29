const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/debrief.cjs";
let s = fs.readFileSync(tp, "utf8");
if (s.indexOf("priority 结构与 algo") !== -1) { console.log("already"); process.exit(0); }
const anchor = `console.log(\`\\ndebrief: \${pass} passed, \${fail} failed\`);
process.exit(fail ? 1 : 0);`;
if (s.indexOf(anchor) === -1) throw new Error("anchor missing");
const add = `// 7.1 priority 结构与 algo
const p = core.assetPriority(chunkAssetId);
check("priority 结构与 algo",
  p.algo === "priority-v1" && p.parts && typeof p.score === "number",
  JSON.stringify(p));

// 7.2 priorityList 有序、带 canonical
const pl = core.priorityList({ limit: 3 });
check("priorityList 有序且带 canonical",
  pl.length > 0
    && pl.every((x, i) => i === 0 || pl[i - 1].score >= x.score)
    && typeof pl[0].canonical === "string"
    && typeof pl[0].asset_kind === "string",
  JSON.stringify(pl.map((x) => [x.canonical, x.score])));

// 7.3 不存在资产抛错
let threw7 = false;
try { core.assetPriority(999999); } catch { threw7 = true; }
check("priority 不存在资产抛错", threw7);

` + anchor;
s = s.replace(anchor, add);
fs.writeFileSync(tp, s);
console.log("patched");
