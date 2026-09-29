const path = require("path");
const { Core, NEW_PER_DAY } = require(path.join(__dirname, "..", "core.cjs"));
const DAY = 86400000;
const dataDir = path.join(__dirname, "..", "data");
const core = new Core(dataDir);
const now = Date.now();
const todayStart = now - (now % DAY);
console.log("NEW_PER_DAY:", NEW_PER_DAY);
const introduced = core.user.prepare(`SELECT COUNT(*) AS n FROM cards c WHERE c.state!=0 AND EXISTS(
  SELECT 1 FROM review_log rl WHERE rl.card_id=c.id AND rl.rated_at>=?
  AND rl.id=(SELECT MIN(id) FROM review_log WHERE card_id=c.id))`).get(todayStart).n;
console.log("introduced today:", introduced);
const fresh = core.user.prepare("SELECT id, note_id, asset_id, card_type, state FROM cards WHERE state=0 ORDER BY created_at LIMIT ?")
  .all(Math.max(0, Math.min(NEW_PER_DAY - introduced, 200)));
console.log("fresh rows:", fresh.length, fresh.map((f) => f.id + (f.asset_id ? "/a" + f.asset_id : "")));
const dueQ = core.user.prepare("SELECT id, note_id, asset_id, card_type, state FROM cards WHERE state!=0 AND due<=? ORDER BY due LIMIT ?")
  .all(now, 200);
console.log("due rows:", dueQ.length);
const all = core.getDue(200);
console.log("getDue out:", all.length, all.map((d) => (d.asset_id ? "a" + d.asset_id : "n" + d.note_id)));
