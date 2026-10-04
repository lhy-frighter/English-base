const fs = require("node:fs");

// theme.css：只替换规则行（唯一），注释另加
const tp = "D:/vibe coding/英语学习/app-electron/src/theme.css";
let t = fs.readFileSync(tp, "utf8");
const oldRule = ".panel { top: max(64px, 7vh); max-height: calc(100vh - 100px); }";
const newRule = ".panel { top: max(150px, 20vh); max-height: calc(100vh - 162px); }";
if (!t.includes(oldRule)) { console.log("theme rule NOT FOUND"); process.exit(1); }
t = t.replace(oldRule, newRule);
fs.writeFileSync(tp, t);
console.log("theme.css patched");

// App.tsx：aside 加 key
const ap = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let a = fs.readFileSync(ap, "utf8");
const oldAside = `<aside className="panel">`;
const newAside = `<aside className="panel" key={entryKey}>`;
if (!a.includes(oldAside)) {
  if (a.includes(newAside)) { console.log("App.tsx already patched"); }
  else { console.log("aside NOT FOUND"); process.exit(1); }
} else {
  a = a.replace(oldAside, newAside);
  fs.writeFileSync(ap, a);
  console.log("App.tsx patched");
}
