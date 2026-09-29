const { Core } = require("../core.cjs");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "readamt-"));
fs.copyFileSync(path.join(__dirname, "..", "data", "user.sqlite"), path.join(tmp, "user.sqlite"));
const core = new Core(tmp);

// 新会话语义：begin 0 → heartbeat 推进 80 → close 150
const textId = core.user.prepare("SELECT id FROM texts LIMIT 1").get().id;
const key = "read:text:" + textId + ":" + Date.now();
core.beginSession({ kind: "read", sessionKey: key, refType: "text", refId: String(textId),
  titleSnapshot: "t", unit: "words", amount: 0 });
core.heartbeatSession(key, { activeMs: 20000, amount: 80 });
core.closeSession(key, { activeMs: 40000, amount: 150 });
const ins = core.insights(7);
console.log("存量修复后 + 新会话 150：7 天精读词数 =", ins.totals.readWords, "（期望 333+150=483）");

// 再开同文新会话只推进少量（模拟基线生效）
const key2 = "read:text:" + textId + ":" + (Date.now() + 1);
core.beginSession({ kind: "read", sessionKey: key2, refType: "text", refId: String(textId),
  titleSnapshot: "t", unit: "words", amount: 0 });
core.closeSession(key2, { activeMs: 10000, amount: 30 });
const ins2 = core.insights(90);
console.log("第二次打开只 +30：90 天精读词数 =", ins2.totals.readWords, "（期望 513）");
core.user.close();
fs.rmSync(tmp, { recursive: true, force: true });
