// 测试辅助：把跟读台所有 active 句子的到期时间拨到现在，让今日页立即出现「跟读续练」卡
// 仅用于本机测试，不影响真实调度语义（重练后会按 1/3/7 重新排）
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const dbPath = path.join(__dirname, "..", "data", "user.sqlite");
const db = new DatabaseSync(dbPath);
const r = db.prepare("UPDATE shadow_sentences SET due_at=? WHERE status='active'").run(Date.now());
console.log("已拨到期句子数:", r.changes);
db.close();
