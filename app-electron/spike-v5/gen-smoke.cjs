const fs = require("fs");
const content = `// 真实库 v14 冒烟（可重入）：
//  - 首跑（v13）：验证迁移、新备份、计数无漂移
//  - 重跑（v14）：验证既有备份存在、迁移可重入、数据稳定
//  - 资产卡：建 → 字段核对 → 级联清理，不污染真实库
const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const { DatabaseSync } = require("node:sqlite");

const dataDir = path.join(__dirname, "..", "data");
const dbFile = path.join(dataDir, "user.sqlite");
const { Core } = require(path.join(__dirname, "..", "core.cjs"));

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("PASS", msg); }
  else { fail++; console.log("FAIL", msg); }
}

// 0) Electron 不应在运行
const procs = cp.execSync('tasklist /FI "IMAGENAME eq electron.exe" /NH', { encoding: "utf8" });
ok(!/electron\\.exe/i.test(procs), "无 electron 进程占用库");

// 1) 迁移前版本与原始计数
const pre = new DatabaseSync(dbFile);
const preVer = Object.values(pre.prepare("PRAGMA user_version").get())[0];
ok(preVer === 13 || preVer === 14, "迁移前版本为 13 或 14（实际 " + preVer + "）");
const rawCounts = {};
for (const t of ["cards", "review_log", "lexemes", "notes"]) {
  rawCounts[t] = Object.values(pre.prepare("SELECT COUNT(*) AS c FROM " + t).get())[0];
}
const preTexts = pre.prepare("SELECT id, stats_json FROM texts").all();
pre.close();

const bakDir = path.join(dataDir, "backups");
const listV14Baks = () =>
  fs.existsSync(bakDir) ? fs.readdirSync(bakDir).filter((f) => /^pre-v14/.test(f)) : [];
const beforeBaks = listV14Baks();

// 2) 实例化 Core（v13 时触发 migrate：备份 + v14；v14 时仅自愈/重入）
const core = new Core(dataDir);
const postV = Object.values(core.user.prepare("PRAGMA user_version").get())[0];
ok(postV === 14, "当前 user_version=14（实际 " + postV + "）");

// 2.1) 清理历史冒烟/调试残留（cards FK 已带 ON DELETE CASCADE）
core.user.exec("PRAGMA foreign_keys=ON");
const leftovers = core.user.prepare(
  "SELECT id FROM learning_assets WHERE idempotency_key IN ('smoke-v14-001','dbg-v14-002') OR canonical IN ('smoke test phrase only','debug phrase xyz only')"
).all();
for (const a of leftovers) core.user.prepare("DELETE FROM learning_assets WHERE id=?").run(a.id);
console.log("INFO 清理历史冒烟残留 " + leftovers.length + " 条");

// 3) 备份核对
const afterBaks = listV14Baks();
if (preVer === 13) {
  ok(afterBaks.length === beforeBaks.length + 1, "首跑生成新 pre-v14 备份（" + afterBaks[afterBaks.length - 1] + "）");
} else {
  ok(afterBaks.length >= 1, "重跑：既有 pre-v14 备份存在（" + afterBaks.length + " 份）");
}
const newestBak = afterBaks[afterBaks.length - 1];
const bakDb = new DatabaseSync(path.join(bakDir, newestBak));
ok(Object.values(bakDb.prepare("PRAGMA integrity_check").get())[0] === "ok", newestBak + " integrity_check=ok");
ok(Object.values(bakDb.prepare("PRAGMA user_version").get())[0] === 13, newestBak + " 备份版本为 13");
bakDb.close();

// 4) 稳定基线计数（清理残留后的当前状态）
const base = {};
for (const t of ["cards", "review_log", "lexemes", "notes"]) {
  base[t] = core.user.prepare("SELECT COUNT(*) AS c FROM " + t).get().c;
}
// 首跑额外核对：迁移本身未造成计数漂移
if (preVer === 13) {
  for (const t of ["cards", "review_log", "lexemes", "notes"]) {
    ok(base[t] === rawCounts[t], "迁移未改 " + t + " 行数（" + base[t] + "）");
  }
}

// 5) 旧词卡 DTO 可取且字段完整
const dueOld = core.getDue(200);
ok(dueOld.length >= 1 && dueOld[0].note_id != null, "getDue 取出旧词卡（" + dueOld.length + " 张到期）");
const c0 = dueOld[0];
ok(!!c0.sentence && !!c0.word, "旧词卡正面/词元完整（" + c0.card_type + "）");

// 6) 新资产卡：建 → 字段核对 → 级联清理
const r1 = core.captureAsset({
  asset_kind: "chunk", canonical: "smoke test phrase only", gloss: "冒烟用临时词块",
  payload: { zh_intent: "临时", example_en: "This is a smoke test phrase only here." },
  encounter: { origin_kind: "reading", origin_ref: "smoke", locator: { via: "smoke" } },
  idempotency_key: "smoke-v14-001",
});
ok(r1.created === true, "临时资产创建成功");
ok(r1.cards_created === 2, "卡片工厂产出 2 张（实际 " + r1.cards_created + "）");
const rawCards = core.user.prepare("SELECT card_type,state,due FROM cards WHERE asset_id=? ORDER BY card_type").all(r1.asset_id);
ok(rawCards.length === 2 && rawCards.every((c) => c.state === 0 && c.due > 0),
  "两张资产卡 state=0、due 已排（实际 " + rawCards.length + "）");
ok(rawCards.some((c) => c.card_type === "chunk_recall") && rawCards.some((c) => c.card_type === "chunk_cloze"),
  "chunk_recall + chunk_cloze 类型正确");
// 新卡队列按 created_at 旧→新、受每日新卡配额（NEW_PER_DAY=12）限制；
// 有历史新卡积压时新资产排队（预期），队列对资产卡的完整兼容由 v14-migration Part C 验证
const inQueueNow = core.getDue(200).filter((c) => c.asset_id === r1.asset_id).length;
console.log("INFO 临时资产当前进入 getDue 卡数：" + inQueueNow + "（受新卡配额/积压影响）");
// 级联清理
core.user.prepare("DELETE FROM learning_assets WHERE id=?").run(r1.asset_id);
ok(core.user.prepare("SELECT COUNT(*) c FROM learning_assets WHERE id=?").get(r1.asset_id).c === 0, "临时资产已删除");
ok(core.user.prepare("SELECT COUNT(*) c FROM cards WHERE asset_id=?").get(r1.asset_id).c === 0, "临时卡级联删除");
ok(core.user.prepare("SELECT COUNT(*) c FROM asset_encounters WHERE asset_id=?").get(r1.asset_id).c === 0, "临时相遇级联删除");
ok(core.user.prepare("SELECT COUNT(*) c FROM cards").get().c === base.cards, "清理后 cards 回到基线（" + base.cards + "）");

// 7) 覆盖率/已知词不变
let statsSame = true;
for (const t of preTexts) {
  const now = core.user.prepare("SELECT stats_json FROM texts WHERE id=?").get(t.id);
  if ((now?.stats_json ?? null) !== (t.stats_json ?? null)) statsSame = false;
}
ok(statsSame, "各文章 stats_json（覆盖率快照）不变");
ok(core.user.prepare("SELECT COUNT(*) c FROM lexemes").get().c === base.lexemes, "已知词数不变");

// 8) 模拟重启：二次实例化，迁移可重入、无数据变化
const core2 = new Core(dataDir);
ok(Object.values(core2.user.prepare("PRAGMA user_version").get())[0] === 14, "重启后版本仍 14");
ok(core2.user.prepare("SELECT COUNT(*) c FROM cards").get().c === base.cards, "重启后 cards 不变（" + base.cards + "）");
ok(core2.user.prepare("SELECT COUNT(*) c FROM learning_assets").get().c === 0, "重启后无残留临时资产");
ok(Object.values(core2.user.prepare("PRAGMA integrity_check").get())[0] === "ok", "integrity_check=ok");
ok(core2.user.prepare("PRAGMA foreign_key_check").all().length === 0, "foreign_key_check=0");

console.log("\\nSMOKE: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
`;
fs.writeFileSync("D:/vibe coding/英语学习/app-electron/test/real-v14-smoke.cjs", content);
console.log("smoke regenerated", content.length);
