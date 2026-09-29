const fs = require("fs");
const fp = "main.cjs";
let s = fs.readFileSync(fp, "utf8");
const bad = /  Menu\.setApplicationMenu\(null\);\r?\n  const spikeOn = process\.env\["APP_V8_SPIKE"\] === "1";\r?\n  win\.loadURL/;
if (!bad.test(s)) { console.log("pattern not found"); process.exit(1); }
s = s.replace(bad, '  Menu.setApplicationMenu(null);\n  win.loadURL');
fs.writeFileSync(fp, s, "utf8");
console.log("duplicate removed, remaining spikeOn decls:", (s.match(/const spikeOn/g) || []).length);
