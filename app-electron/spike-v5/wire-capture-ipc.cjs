const fs = require("fs");
// main.cjs
const mp = "D:/vibe coding/英语学习/app-electron/main.cjs";
let m = fs.readFileSync(mp, "utf8");
const mOld = "      createShadowNote: (p) => core.createShadowNote(p),\n";
if (!m.includes(mOld)) throw new Error("main anchor missing");
m = m.replace(mOld, mOld +
  "      captureAsset: (p) => core.captureAsset(p),\n" +
  "      addPronProductionCard: ({ assetId }) => core.addPronProductionCard(assetId),\n");
fs.writeFileSync(mp, m);

// preload.cjs
const pp = "D:/vibe coding/英语学习/app-electron/preload.cjs";
let p = fs.readFileSync(pp, "utf8");
const pOld = "  createShadowNote: (p) => call(\"createShadowNote\", p),\n";
if (!p.includes(pOld)) throw new Error("preload anchor missing");
p = p.replace(pOld, pOld +
  "  captureAsset: (inp) => call(\"captureAsset\", inp),\n" +
  "  addPronProductionCard: (assetId) => call(\"addPronProductionCard\", { assetId }),\n");
fs.writeFileSync(pp, p);
console.log("IPC wired");
