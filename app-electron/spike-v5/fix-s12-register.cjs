const fs = require("fs");
const fp = "package.json";
const j = JSON.parse(fs.readFileSync(fp, "utf8"));
if (!j.scripts.test.includes("s12-assessment")) {
  j.scripts.test = j.scripts.test.replace(" && node test/audit-heuristics.cjs",
    " && node test/s12-assessment.cjs && node test/audit-heuristics.cjs");
  fs.writeFileSync(fp, JSON.stringify(j, null, 2) + "\n", "utf8");
  console.log("chain registered");
} else console.log("already");
