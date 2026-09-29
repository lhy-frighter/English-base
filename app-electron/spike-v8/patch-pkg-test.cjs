const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/package.json";
const j = JSON.parse(fs.readFileSync(p, "utf8"));
const chain = j.scripts.test.split(" && ");
if (chain.includes("node --experimental-strip-types test/grammar-normalize.ts")) {
  console.log("already present");
} else {
  // 放在 teach-parse 之后（同类纯逻辑测试相邻）
  const anchor = "node --experimental-strip-types test/teach-parse.ts";
  const i = chain.indexOf(anchor);
  if (i === -1) { console.log("ANCHOR MISSING"); process.exit(2); }
  chain.splice(i + 1, 0, "node --experimental-strip-types test/grammar-normalize.ts");
  j.scripts.test = chain.join(" && ");
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  console.log("package.json test chain updated");
}
