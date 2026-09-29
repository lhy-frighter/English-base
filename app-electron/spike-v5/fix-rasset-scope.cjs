const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/components/AssetCaptureSheet.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  if (s.indexOf(oldStr, i + 1) >= 0) throw new Error("NOT UNIQUE: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}
R(
  `    try {
      if (kind === "word") {`,
  `    try {
      let rAsset: CaptureAssetResult | undefined;
      if (kind === "word") {`,
  "outer decl"
);
R(
  `        let rAsset: CaptureAssetResult | undefined;
        const r = await api.captureAsset({`,
  `        const r = await api.captureAsset({`,
  "remove inner"
);
fs.writeFileSync(p, s);
console.log("rAsset scope fixed");
