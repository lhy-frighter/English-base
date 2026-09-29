const { Core } = require("../core.cjs");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");

// 复制真实库到临时目录，跑修复
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "readamt-"));
fs.copyFileSync(path.join(__dirname, "..", "data", "user.sqlite"), path.join(tmp, "user.sqlite"));
const core = new Core(tmp);
const rowsBefore = core.user.prepare(
  "SELECT id, amount, active_ms FROM learning_sessions WHERE kind='read' ORDER BY id").all();
console.log("修复后 read 会话:");
rowsBefore.forEach((r) => console.log("  id", r.id, "amount", r.amount, "active_s", Math.round((r.active_ms||0)/1000)));
const ins = core.insights(90);
console.log("90 天总精读词数:", ins.totals.readWords);
// 幂等：再构造一次
const fixed2 = core.repairReadAmounts();
console.log("二次调用修复数（应为 0）:", fixed2);

// 新会话语义：begin 0 → heartbeat 推进 → close
const textId = core.user.prepare("SELECT id FROM texts LIMIT 1").get().id;
const key = "read:text:" + textId + ":" + Date.now();
core.sessionBegin({ kind: "read", sessionKey: key, refType: "text", refId: String(textId),
  titleSnapshot: "t", unit: "words", amount: 0 });
core.sessionHeartbeat(key, 20000, 80);
core.sessionClose(key, 40000, 150);
const ins2 = core.insights(7);
console.log("加入新会话后今日精读词数（含修复存量）:", ins2.totals.readWords);
core.user.close();
fs.rmSync(tmp, { recursive: true, force: true });
