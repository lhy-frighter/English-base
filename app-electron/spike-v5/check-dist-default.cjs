const fs = require("node:fs");
const path = "D:/vibe coding/英语学习/app-electron/dist/assets";
const file = fs.readdirSync(path).find((f) => f.endsWith(".js"));
const c = fs.readFileSync(path + "/" + file, "utf8");
for (const id of ["q4f16_1-MLC", "q4f32_1-MLC"]) {
  const i = c.indexOf(`DEFAULT_LOCAL_MODEL=`);
  if (i >= 0) { console.log("DEFAULT site:", c.slice(i, i + 60)); break; }
}
// 直接找 DEFAULT 赋值形态
const m = c.match(/DEFAULT_LOCAL_MODEL\s*=\s*"([^"]+)"/);
console.log("DEFAULT_LOCAL_MODEL =", m ? m[1] : "not found");
