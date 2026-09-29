const fs = require("fs");
const fp = "main.cjs";
let s = fs.readFileSync(fp, "utf8");
const eol = s.includes("\r\n") ? "\r\n" : "\n";
const bad = `  Menu.setApplicationMenu(null);${eol}  const spikeOn = process.env["APP_V8_SPIKE"] === "1";${eol}  win.loadURL`;
if (!s.includes(bad)) { console.log("pattern not found"); process.exit(1); }
s = s.replace(bad, `  Menu.setApplicationMenu(null);${eol}  win.loadURL`);
fs.writeFileSync(fp, s, "utf8");
console.log("removed; remaining:", (s.match(/const spikeOn =/g) || []).length);
