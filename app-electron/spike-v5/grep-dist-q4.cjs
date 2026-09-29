const fs = require("node:fs");
const dir = "D:/vibe coding/英语学习/app-electron/dist/assets";
const file = fs.readdirSync(dir).find((f) => f.endsWith(".js"));
const c = fs.readFileSync(dir + "/" + file, "utf8");
let i = -1;
while ((i = c.indexOf("q4f", i + 1)) >= 0) {
  console.log("...", c.slice(Math.max(0, i - 60), i + 40).replace(/\s+/g, " "));
}
