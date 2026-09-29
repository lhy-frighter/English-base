const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/debrief.cjs";
let s = fs.readFileSync(tp, "utf8");
const old =
`const chunkAsset = core.findAssetByCanonical("chunk", "look forward to");
check("chunk 资产可定位", chunkAsset != null);
const s7 = mkSession("sess-7");
const det8 = core.detectUsedAssets({
  sessionKey: "sess-7", turnKey: "u7-1",
  text: "I look forward to it", prompted: [chunkAsset.id],
});
check("引导用出 → used_prompted",
  det8.some((d) => d.asset_id === chunkAsset.id && d.result === "used_prompted"),
  JSON.stringify(det8));

// 6.8 assetUseCounts 汇总
const uc = core.assetUseCounts(chunkAsset.id);
check("用出次数：spontaneous≥1 prompted≥1 after≥1",
  uc.used_spontaneously >= 1 && uc.used_prompted >= 1 && uc.used_after_correction >= 1,
  JSON.stringify(uc));`;
const neu =
`const chunkAssetId = core.findAssetByCanonical("chunk", "look forward to");
check("chunk 资产可定位", chunkAssetId != null);
const s7 = mkSession("sess-7");
const det8 = core.detectUsedAssets({
  sessionKey: "sess-7", turnKey: "u7-1",
  text: "I look forward to it", prompted: [chunkAssetId],
});
check("引导用出 → used_prompted",
  det8.some((d) => d.asset_id === chunkAssetId && d.result === "used_prompted"),
  JSON.stringify(det8));

// 6.8 assetUseCounts 汇总
const uc = core.assetUseCounts(chunkAssetId);
check("用出次数：spontaneous≥1 prompted≥1 after≥1",
  uc.used_spontaneously >= 1 && uc.used_prompted >= 1 && uc.used_after_correction >= 1,
  JSON.stringify(uc));`;
if (s.indexOf(old) === -1) throw new Error("anchor missing");
s = s.replace(old, neu);
fs.writeFileSync(tp, s);
console.log("fixed");
