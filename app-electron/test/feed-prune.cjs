// test/feed-prune.cjs — 推荐流过期清理（#207）
//
// 核心要求是**不误删**。feed_items 只是推荐缓存，但用户「点开导入」过的条目
// 已经变成 texts 里的真实资产——删了缓存会让列表里出现空洞，用户会以为文章丢了。
// 所以口径必须逐条验证：新条目删、导入过的留、dismissed 留、边界时间算准。
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { Core } = require("../core.cjs");

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("PASS", name); }
  else { fail++; console.error("FAIL", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}
const DAY = 86400_000;

function seeded() {
  const core = new Core(fs.mkdtempSync(path.join(os.tmpdir(), "fprune-")));
  const now = Date.now();
  const ins = core.user.prepare(
    "INSERT INTO feed_items (feed_id,guid,title,link,summary,fetched_at,published_at,status,text_id) VALUES(?,?,?,?,?,?,?,?,?)");
  const row = (id, daysAgo, status, textId) =>
    ins.run("builtin-x", "g-" + id, "t" + id, "l" + id, "s" + id,
      now - daysAgo * DAY, now - daysAgo * DAY, status, textId ?? null);
  row("old-new", 90, "new", null);        // 过期未读 → 应删
  row("fresh-new", 10, "new", null);       // 未过期 → 留
  row("old-imported", 90, "imported", 7);  // 过期但已导入 → 必留
  row("old-dismissed", 90, "dismissed", null); // 过期但用户忽略过 → 留
  row("boundary-46", 46, "new", null);     // 超期 → 删
  row("boundary-44", 44, "new", null);     // 未超期 → 留
  return core;
}
const ids = (core) => core.user.prepare("SELECT guid FROM feed_items ORDER BY guid").all().map((r) => r.guid);

// ——— 1) 基本口径 ———
{
  const core = seeded();
  const r = core.pruneStaleFeedItems(45);
  check("删掉 2 条过期未读", r.removed === 2, r);
  const left = ids(core);
  check("已导入的保留", left.includes("g-old-imported"), left);
  check("dismissed 保留", left.includes("g-old-dismissed"), left);
  check("未过期的新条目保留", left.includes("g-fresh-new"), left);
  check("46 天被删", !left.includes("g-boundary-46"), left);
  check("44 天保留", left.includes("g-boundary-44"), left);
  check("90 天未读的已删", !left.includes("g-old-new"), left);
}

// ——— 2) 参数非法时不作为 ———
{
  const core = seeded();
  const r = core.pruneStaleFeedItems(0);
  check("days=0 直接拒绝", r.skipped === "bad_days" && ids(core).length === 6, r);
  const r2 = core.pruneStaleFeedItems(-5);
  check("负数 days 拒绝", r2.skipped === "bad_days", r2);
  const r3 = core.pruneStaleFeedItems(NaN);
  check("NaN 拒绝", r3.skipped === "bad_days", r3);
}

// ——— 3) 保留期可调 ———
{
  const core = seeded();
  const r = core.pruneStaleFeedItems(7);
  // 10/44/46/90 天都超 7 天，只有 imported 与 dismissed 留
  check("7 天保留期下只剩不可删项", ids(core).length === 2, ids(core));
  check("删除数=4", r.removed === 4, r);
}

// ——— 4) 幂等：再跑一次不报错、不再删 ———
{
  const core = seeded();
  core.pruneStaleFeedItems(45);
  const again = core.pruneStaleFeedItems(45);
  check("重复执行幂等", again.removed === 0, again);
}

// ——— 5) 库为空时不炸 ———
{
  const core = new Core(fs.mkdtempSync(path.join(os.tmpdir(), "fprune2-")));
  const r = core.pruneStaleFeedItems(45);
  check("空库执行安全", r.removed === 0, r);
}

// ——— 6) 启动时自动跑（不靠手动调用）———
{
  // 建实例 → 塞一条超期未读 → 再建一个实例（等价于「下次启动应用」）
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fprune3-"));
  let core = new Core(dir);
  core.user.prepare(
    "INSERT INTO feed_items (feed_id,guid,title,link,summary,fetched_at,published_at,status,text_id) VALUES(?,?,?,?,?,?,?,?,?)")
    .run("builtin-x", "g-boot", "t", "l", "s", Date.now() - 90 * DAY, Date.now() - 90 * DAY, "new", null);
  check("首启时数据还在（还没超期清理的目标）", ids(core).length === 1, ids(core));
  core = new Core(dir); // 第二次构造 = 下次启动，启动清理应自动跑
  check("下次启动自动清理超期未读", ids(core).length === 0, ids(core));
}

console.log(`\nfeed-prune: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);