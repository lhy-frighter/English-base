const fs = require("fs");
const fp = "package.json";
const j = JSON.parse(fs.readFileSync(fp, "utf8"));
j.dependencies["@mlc-ai/web-llm"] = "0.2.85";
j.dependencies["loglevel"] = "^1.9.2";
fs.writeFileSync(fp, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("package.json deps written");
