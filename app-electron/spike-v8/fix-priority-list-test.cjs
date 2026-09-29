const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/debrief.cjs";
let s = fs.readFileSync(tp, "utf8");
const old =
`// 7.2 priorityList 有序、带 canonical
const pl = core.priorityList({ limit: 3 });
check("priorityList 有序且带 canonical",
  pl.length > 0
    && pl.every((x, i) => i === 0 || pl[i - 1].score >= x.score)
    && typeof pl[0].canonical === "string"
    && typeof pl[0].asset_kind === "string",
  JSON.stringify(pl.map((x) => [x.canonical, x.score])));`;
const neu =
`// 7.2 priorityList 有序、带 canonical（先造一个有错误证据、无成功证据的弱点资产）
const weakRes = core.captureAsset({
  asset_kind: "chunk", canonical: "on the other hand", gloss: "另一方面",
  payload: { zh_intent: "对比转折" },
  encounter: {
    origin_kind: "conversation", origin_ref: "seed-weak",
    title_snapshot: "seed",
    sentence_snapshot: "On the other hand, it is cheap.",
  },
  idempotency_key: "seed-weak-chunk",
});
core.addAssetEvidence({
  asset_id: weakRes.asset_id, dimension: "chunk_use", result: "wrong",
  source_kind: "conversation", source_ref: "seed-weak",
  payload: {}, idempotency_key: "seed-weak-wrong",
});
const pl = core.priorityList({ limit: 3 });
check("priorityList 有序且带 canonical",
  pl.length > 0
    && pl.some((x) => x.canonical === "on the other hand")
    && pl.every((x, i) => i === 0 || pl[i - 1].score >= x.score)
    && typeof pl[0].canonical === "string"
    && typeof pl[0].asset_kind === "string",
  JSON.stringify(pl.map((x) => [x.canonical, x.score])));`;
if (s.indexOf(old) === -1) throw new Error("anchor missing");
s = s.replace(old, neu);
fs.writeFileSync(tp, s);
console.log("fixed");
