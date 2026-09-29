const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(fp, "utf8"));
let chain = pkg.scripts.test.split(" && ").map((s) => s.trim());
const add = "node test/s11-related.cjs";
if (!chain.includes(add)) {
  const i = chain.indexOf("node test/s11-context-jump.cjs");
  chain.splice(i + 1, 0, add);
  pkg.scripts.test = chain.join(" && ");
  fs.writeFileSync(fp, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}
console.log("chains =", chain.length);
