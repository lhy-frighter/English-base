const fs = require("fs");
const files = ["test/mt-cache.cjs", "test/s11-shadow-review.cjs", "test/text-sources.cjs",
  "test/s9-contract.cjs", "test/shadow-note.cjs"];
let total = 0;
for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  const before = s;
  // 断言当前版本为最新
  s = s.split('user_version").get().user_version === 12').join('user_version").get().user_version === 13');
  // 文案
  s = s.split('check("user_version=12"').join('check("user_version=13"');
  s = s.split('check("前置：user_version=12').join('check("前置：user_version=13');
  // s9-contract：从 v10 重跑，最终版本 13
  s = s.split('user_version").get().user_version === 12, String(reentryErr)').join('user_version").get().user_version === 13, String(reentryErr)');
  s = s.split('user_version").get().user_version === 12);').join('user_version").get().user_version === 13);');
  // shadow-note：重入后版本 13
  s = s.split('user_version").get().user_version === 12);').join('user_version").get().user_version === 13);');
  if (s !== before) { fs.writeFileSync(f, s, "utf8"); total++; console.log("updated", f); }
}
console.log("files updated:", total);
