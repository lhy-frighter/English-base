const fs = require("fs");
const fixes = [
  ["D:/vibe coding/英语学习/app-electron/test/v14-migration.cjs",
    'check("user_version=14", db.prepare("PRAGMA user_version").get().user_version === 14);',
    'check("user_version=15（migrate 跑到最新）", db.prepare("PRAGMA user_version").get().user_version === 15);'],
  ["D:/vibe coding/英语学习/app-electron/test/text-sources.cjs",
    'check("user_version=14", core.user.prepare("PRAGMA user_version").get().user_version === 14);',
    'check("user_version=15", core.user.prepare("PRAGMA user_version").get().user_version === 15);'],
];
for (const [p, old, neu] of fixes) {
  let s = fs.readFileSync(p, "utf8");
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + p);
  s = s.replace(old, neu);
  fs.writeFileSync(p, s);
  console.log("fixed", p);
}
