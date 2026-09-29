const fs = require("fs");
const path = require("path");
const tdir = path.resolve(__dirname, "..", "test");
const edits = [
  ["mt-cache.cjs",
    'check("user_version=10", core.user.prepare("PRAGMA user_version").get().user_version === 10);',
    'check("user_version=11", core.user.prepare("PRAGMA user_version").get().user_version === 11);'],
  ["mt-cache.cjs",
    'check("重开 Core 迁移可重入", !reopenErr && reopened.user.prepare("PRAGMA user_version").get().user_version === 10, String(reopenErr));',
    'check("重开 Core 迁移可重入", !reopenErr && reopened.user.prepare("PRAGMA user_version").get().user_version === 11, String(reopenErr));'],
  ["shadow-note.cjs",
    'check("前置：user_version=10（notes.source 分层 + feeds v8 + text_sources v9 + text_translations v10）", core.user.prepare("PRAGMA user_version").get().user_version === 10);',
    'check("前置：user_version=11（notes.source 分层 + feeds v8 + text_sources v9 + text_translations v10 + S9 v11）", core.user.prepare("PRAGMA user_version").get().user_version === 11);'],
  ["shadow-note.cjs",
    'check("重入后版本正确回到最新（10）", recovered && recovered.user.prepare("PRAGMA user_version").get().user_version === 10);',
    'check("重入后版本正确回到最新（11）", recovered && recovered.user.prepare("PRAGMA user_version").get().user_version === 11);'],
  ["text-sources.cjs",
    'check("user_version=10", core.user.prepare("PRAGMA user_version").get().user_version === 10);',
    'check("user_version=11", core.user.prepare("PRAGMA user_version").get().user_version === 11);'],
];
for (const [rel, a, b] of edits) {
  const fp = path.join(tdir, rel);
  let s = fs.readFileSync(fp, "utf8");
  if (s.includes(b)) { console.log("skip", rel, b.slice(0, 40)); continue; }
  if (!s.includes(a)) throw new Error("anchor missing in " + rel + ": " + a.slice(0, 50));
  fs.writeFileSync(fp, s.replace(a, b));
  console.log("patched", rel);
}
