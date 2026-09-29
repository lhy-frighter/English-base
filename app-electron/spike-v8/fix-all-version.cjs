const fs = require("fs");
const edits = [
  ["D:/vibe coding/英语学习/app-electron/test/mt-cache.cjs",
    'check("user_version=14", core.user.prepare("PRAGMA user_version").get().user_version === 14);',
    'check("user_version=15", core.user.prepare("PRAGMA user_version").get().user_version === 15);',
    'check("重开 Core 迁移可重入", !reopenErr && reopened.user.prepare("PRAGMA user_version").get().user_version === 14, String(reopenErr));',
    'check("重开 Core 迁移可重入", !reopenErr && reopened.user.prepare("PRAGMA user_version").get().user_version === 15, String(reopenErr));'],
  ["D:/vibe coding/英语学习/app-electron/test/s11-shadow-review.cjs",
    'check("user_version=14", db.prepare("PRAGMA user_version").get().user_version === 14);',
    'check("user_version=15", db.prepare("PRAGMA user_version").get().user_version === 15);'],
  ["D:/vibe coding/英语学习/app-electron/test/shadow-note.cjs",
    'check("前置：user_version=14（notes.source 分层 + feeds v8 + text_sources v9 + text_translations v10 + S9 v11 + V9 v14）", core.user.prepare("PRAGMA user_version").get().user_version === 14);',
    'check("前置：user_version=15（迁移到最新）", core.user.prepare("PRAGMA user_version").get().user_version === 15);',
    'check("重入后版本正确回到最新（14）", recovered && recovered.user.prepare("PRAGMA user_version").get().user_version === 14);',
    'check("重入后版本正确回到最新（15）", recovered && recovered.user.prepare("PRAGMA user_version").get().user_version === 15);'],
  ["D:/vibe coding/英语学习/app-electron/test/real-v14-smoke.cjs",
    'ok(postV === 14, "当前 user_version=14（实际 " + postV + "）");',
    'ok(postV === 15, "当前 user_version=15（实际 " + postV + "）");',
    'ok(Object.values(core2.user.prepare("PRAGMA user_version").get())[0] === 14, "重启后版本仍 14");',
    'ok(Object.values(core2.user.prepare("PRAGMA user_version").get())[0] === 15, "重启后版本仍 15");'],
];
for (const e of edits) {
  const p = e[0];
  let s = fs.readFileSync(p, "utf8");
  for (let i = 1; i < e.length; i += 2) {
    const old = e[i], neu = e[i + 1];
    if (s.indexOf(old) === -1) throw new Error("anchor missing in " + p + ": " + old.slice(0, 50));
    s = s.split(old).join(neu);
  }
  fs.writeFileSync(p, s);
  console.log("fixed", p);
}
