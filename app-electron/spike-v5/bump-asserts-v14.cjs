const fs = require("fs");
const tdir = "D:/vibe coding/英语学习/app-electron/test/";
function patch(file, pairs) {
  const p = tdir + file;
  let s = fs.readFileSync(p, "utf8");
  for (const [oldStr, newStr] of pairs) {
    if (!s.includes(oldStr)) throw new Error(file + " NOT FOUND: " + oldStr.slice(0, 60));
    s = s.replace(oldStr, newStr);
  }
  fs.writeFileSync(p, s);
  console.log("updated", file);
}

patch("mt-cache.cjs", [
  ['check("user_version=13", core.user.prepare("PRAGMA user_version").get().user_version === 13);',
   'check("user_version=14", core.user.prepare("PRAGMA user_version").get().user_version === 14);'],
  ['check("重开 Core 迁移可重入", !reopenErr && reopened.user.prepare("PRAGMA user_version").get().user_version === 13, String(reopenErr));',
   'check("重开 Core 迁移可重入", !reopenErr && reopened.user.prepare("PRAGMA user_version").get().user_version === 14, String(reopenErr));'],
]);

patch("s11-shadow-review.cjs", [
  ['check("user_version=13", db.prepare("PRAGMA user_version").get().user_version === 13);',
   'check("user_version=14", db.prepare("PRAGMA user_version").get().user_version === 14);'],
]);

patch("s9-contract.cjs", [
  ['check("user_version=13", db.prepare("PRAGMA user_version").get().user_version === 13);',
   'check("user_version=14", db.prepare("PRAGMA user_version").get().user_version === 14);'],
  ['check("v11/v12 表已存在时重跑迁移不报错（可重入）", reentryOk && db.prepare("PRAGMA user_version").get().user_version === 13);',
   'check("v11/v12 表已存在时重跑迁移不报错（可重入）", reentryOk && db.prepare("PRAGMA user_version").get().user_version === 14);'],
  ['check("缺表后重跑迁移补齐 coverage_assessments", tableExists("coverage_assessments") && db.prepare("PRAGMA user_version").get().user_version === 13);',
   'check("缺表后重跑迁移补齐 coverage_assessments", tableExists("coverage_assessments") && db.prepare("PRAGMA user_version").get().user_version === 14);'],
]);

patch("shadow-note.cjs", [
  ['check("前置：user_version=13（notes.source 分层 + feeds v8 + text_sources v9 + text_translations v10 + S9 v11）", core.user.prepare("PRAGMA user_version").get().user_version === 13);',
   'check("前置：user_version=14（notes.source 分层 + feeds v8 + text_sources v9 + text_translations v10 + S9 v11 + V9 v14）", core.user.prepare("PRAGMA user_version").get().user_version === 14);'],
  ['check("重入后版本正确回到最新（12）", recovered && recovered.user.prepare("PRAGMA user_version").get().user_version === 13);',
   'check("重入后版本正确回到最新（14）", recovered && recovered.user.prepare("PRAGMA user_version").get().user_version === 14);'],
]);

patch("text-sources.cjs", [
  ['check("user_version=13", core.user.prepare("PRAGMA user_version").get().user_version === 13);',
   'check("user_version=14", core.user.prepare("PRAGMA user_version").get().user_version === 14);'],
]);

patch("v13-conversation.cjs", [
  ['check("user_version=13", db.prepare("PRAGMA user_version").get().user_version === 13);',
   'check("user_version=14", db.prepare("PRAGMA user_version").get().user_version === 14);'],
  ['check("升级后 user_version=13", up.user.prepare("PRAGMA user_version").get().user_version === 13);',
   'check("升级后 user_version=14", up.user.prepare("PRAGMA user_version").get().user_version === 14);'],
  ['check("重入迁移不报错且版本=13",\n  !reentryErr && core3.user.prepare("PRAGMA user_version").get().user_version === 13, String(reentryErr));',
   'check("重入迁移不报错且版本=14",\n  !reentryErr && core3.user.prepare("PRAGMA user_version").get().user_version === 14, String(reentryErr));'],
]);
console.log("all version assertions bumped");
