const path = require("path");
const { Core } = require(path.join(__dirname, "..", "core.cjs"));
const dataDir = path.join(__dirname, "..", "data");
const core = new Core(dataDir);
const r = core.captureAsset({
  asset_kind: "chunk", canonical: "debug phrase xyz only", gloss: "调试",
  payload: { zh_intent: "x", example_en: "A debug phrase xyz only appears." },
  encounter: { origin_kind: "reading", origin_ref: "dbg", locator: { via: "dbg" } },
  idempotency_key: "dbg-v14-002",
});
console.log("result:", r);
const cards = core.user.prepare("SELECT id, asset_id, card_type, state, due, created_at FROM cards WHERE asset_id=?").all(r.asset_id);
console.log("cards:", cards);
const state0 = core.user.prepare("SELECT COUNT(*) c FROM cards WHERE state=0").get();
console.log("state=0 total:", state0.c);
const due = core.getDue(200).filter((c) => c.asset_id === r.asset_id);
console.log("in getDue:", due.length, due.map((d) => d.card_type));
