const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/v13-conversation.cjs";
let s = fs.readFileSync(tp, "utf8");
function fix(old, neu) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + old.slice(0, 50));
  s = s.split(old).join(neu);
}
fix(
  'check("user_version=14", db.prepare("PRAGMA user_version").get().user_version === 14);',
  'check("user_version=15", db.prepare("PRAGMA user_version").get().user_version === 15);');
fix(
  'check("升级后 user_version=14", up.user.prepare("PRAGMA user_version").get().user_version === 14);',
  'check("升级后 user_version=15", up.user.prepare("PRAGMA user_version").get().user_version === 15);');
fix(
  'check("重入迁移不报错且版本=14",',
  'check("重入迁移不报错且版本=15",');
fix(
  'core3.user.prepare("PRAGMA user_version").get().user_version === 14, String(reentryErr));',
  'core3.user.prepare("PRAGMA user_version").get().user_version === 15, String(reentryErr));');
fs.writeFileSync(tp, s);
console.log("fixed");
