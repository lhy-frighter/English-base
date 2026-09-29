const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/test/real-v14-smoke.cjs";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// 1) 残留清理
R(
  `ok(postV === 14, "迁移后 user_version=14（实际 " + postV + "）");`,
  `ok(postV === 14, "迁移后 user_version=14（实际 " + postV + "）");

// 3.1) 清理此前失败运行残留的冒烟/调试资产（cards FK 已带 ON DELETE CASCADE）
core.user.exec("PRAGMA foreign_keys=ON");
const leftovers = core.user.prepare(
  "SELECT id FROM learning_assets WHERE idempotency_key IN ('smoke-v14-001','dbg-v14-002') OR canonical IN ('smoke test phrase only','debug phrase xyz only')"
).all();
for (const a of leftovers) core.user.prepare("DELETE FROM learning_assets WHERE id=?").run(a.id);
console.log("INFO 清理历史冒烟残留 " + leftovers.length + " 条");`,
  "leftover cleanup"
);

// 2) 资产卡断言：改为直接核对卡片字段（队列配额另算）
R(
  `ok(r1.created === true, "临时资产创建成功");
const dueAfter = core.getDue(200);
const assetCards = dueAfter.filter((c) => c.asset_id != null);
ok(assetCards.length >= 2, "资产卡进入到期队列（chunk 两张，实际 " + assetCards.length + "）");
ok(assetCards.some((c) => c.card_type === "chunk_recall") && assetCards.some((c) => c.card_type === "chunk_cloze"),
  "chunk_recall + chunk_cloze 均在队列");
// 清理：FK 级联
core.user.exec("PRAGMA foreign_keys=ON");
core.user.prepare("DELETE FROM learning_assets WHERE id=?").run(r1.asset_id);`,
  `ok(r1.created === true, "临时资产创建成功");
ok(r1.cards_created === 2, "卡片工厂产出 2 张（实际 " + r1.cards_created + "）");
const rawCards = core.user.prepare("SELECT card_type,state,due FROM cards WHERE asset_id=? ORDER BY card_type").all(r1.asset_id);
ok(rawCards.length === 2 && rawCards.every((c) => c.state === 0 && c.due > 0),
  "两张资产卡 state=0、due 已排（实际 " + rawCards.length + "）");
ok(rawCards.some((c) => c.card_type === "chunk_recall") && rawCards.some((c) => c.card_type === "chunk_cloze"),
  "chunk_recall + chunk_cloze 类型正确");
// 新卡队列按 created_at 旧→新、受每日新卡配额（NEW_PER_DAY=12）限制；
// 真实库有历史新卡积压时新资产排队等待（属预期），队列对资产卡的完整兼容由 v14-migration Part C 验证
const inQueueNow = core.getDue(200).filter((c) => c.asset_id === r1.asset_id).length;
console.log("INFO 临时资产当前进入 getDue 的卡数：" + inQueueNow + "（受新卡配额/积压影响）");
// 清理：FK 级联
core.user.prepare("DELETE FROM learning_assets WHERE id=?").run(r1.asset_id);`,
  "asset assertions"
);

fs.writeFileSync(p, s);
console.log("smoke script fixed");
