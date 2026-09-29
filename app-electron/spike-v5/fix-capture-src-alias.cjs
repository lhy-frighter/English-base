const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/components/AssetCaptureSheet.tsx";
let s = fs.readFileSync(p, "utf8");
// 在 render guard 后加 const src = source;
const guard = `  if (!open || !source) return null;
  const sentence = source.sentence || canonical;`;
if (!s.includes(guard)) throw new Error("guard anchor missing");
s = s.replace(guard, `  if (!open || !source) return null;
  const src = source;
  const sentence = src.sentence || canonical;`);
// encounter 内改用 src
const oldEnc = `          encounter: {
            origin_kind: source.originKind,
            origin_ref: source.originRef,
            title: source.title,
            sentence,
            locator: { via: "capture-sheet" },
          },`;
if (!s.includes(oldEnc)) throw new Error("enc anchor missing");
s = s.replace(oldEnc, `          encounter: {
            origin_kind: src.originKind,
            origin_ref: src.originRef,
            title: src.title,
            sentence,
            locator: { via: "capture-sheet" },
          },`);
fs.writeFileSync(p, s);
console.log("src alias applied");
