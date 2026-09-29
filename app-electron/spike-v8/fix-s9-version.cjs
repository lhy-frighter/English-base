const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/s9-contract.cjs";
let s = fs.readFileSync(tp, "utf8");
function fix(old, neu) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + old.slice(0, 40));
  s = s.split(old).join(neu);
}
fix(
  'check("v11/v12 表已存在时重跑迁移不报错（可重入）", reentryOk && db.prepare("PRAGMA user_version").get().user_version === 14);',
  'check("v11/v12 表已存在时重跑迁移不报错（可重入）", reentryOk && db.prepare("PRAGMA user_version").get().user_version === 15);');
fix(
  'check("缺表后重跑迁移补齐 coverage_assessments", tableExists("coverage_assessments") && db.prepare("PRAGMA user_version").get().user_version === 14);',
  'check("缺表后重跑迁移补齐 coverage_assessments", tableExists("coverage_assessments") && db.prepare("PRAGMA user_version").get().user_version === 15);');
fs.writeFileSync(tp, s);
console.log("fixed");
