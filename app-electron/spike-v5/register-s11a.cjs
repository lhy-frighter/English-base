const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(fp, "utf8"));
const chain = pkg.scripts.test.split(" && ").map((s) => s.trim());
if (!chain.includes("node test/s11-context-jump.cjs")) {
  const i = chain.indexOf("node test/s10-insights.cjs");
  chain.splice(i + 1, 0, "node test/s11-context-jump.cjs");
  pkg.scripts.test = chain.join(" && ");
  fs.writeFileSync(fp, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("registered, chains =", chain.length);
} else console.log("already");
