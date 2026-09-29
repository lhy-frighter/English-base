const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/test/asset-service.cjs";
let s = fs.readFileSync(p, "utf8");
if (s.indexOf("findAssetByCanonical 命中") !== -1) {
  console.log("already");
  process.exit(0);
}
const anchor = `console.log(\`\\nasset-service: \${pass} passed, \${fail} failed\`);
process.exit(fail ? 1 : 0);`;
if (s.indexOf(anchor) === -1) throw new Error("anchor missing");
const add = `// —— 11. findAssetByCanonical + addAssetEvidence（跟读 inline drill 前置） ——
const pronR = core.captureAsset({
  asset_kind: "pronunciation",
  canonical: "Benefit",
  payload: { ipa: "/ˈbenɪfɪt/", problem_type: "segmental" },
  idempotency_key: idem(),
});
check("findAssetByCanonical 命中（大小写/空白不敏感）",
  core.findAssetByCanonical("pronunciation", "  benefit ") === pronR.asset_id);
check("findAssetByCanonical 未命中返回 null",
  core.findAssetByCanonical("pronunciation", "no-such-word") === null);
throws("findAssetByCanonical kind 非法", () =>
  core.findAssetByCanonical("nope", "x"));
const ev1 = core.addAssetEvidence({
  asset_id: pronR.asset_id, dimension: "word_rerecord",
  result: "practice_observation", source_kind: "shadow", source_ref: "shadow",
  payload: { text_match: 80 }, idempotency_key: "ev-obs-1",
});
check("addAssetEvidence 写入", ev1.replayed === false);
const ev2 = core.addAssetEvidence({
  asset_id: pronR.asset_id, dimension: "word_rerecord",
  result: "improved", source_kind: "shadow", source_ref: "shadow",
  idempotency_key: "ev-imp-1",
});
check("addAssetEvidence improved 写入", ev2.replayed === false);
check("addAssetEvidence 幂等重放",
  core.addAssetEvidence({
    asset_id: pronR.asset_id, dimension: "word_rerecord",
    result: "improved", source_kind: "shadow", idempotency_key: "ev-imp-1",
  }).replayed === true);
throws("addAssetEvidence 非法 result 被拒", () =>
  core.addAssetEvidence({
    asset_id: pronR.asset_id, dimension: "d", result: "nope",
    source_kind: "shadow", idempotency_key: "ev-bad",
  }));
throws("addAssetEvidence 资产不存在被拒", () =>
  core.addAssetEvidence({
    asset_id: 99999, dimension: "d", result: "improved",
    source_kind: "shadow", idempotency_key: "ev-missing",
  }));

` + anchor;
s = s.replace(anchor, add);
fs.writeFileSync(p, s);
console.log("patched");
