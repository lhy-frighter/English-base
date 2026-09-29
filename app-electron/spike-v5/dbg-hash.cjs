const { Core } = require("../core.cjs");
const crypto = require("node:crypto");
const path = require("path");
const core = new Core(path.resolve("data"));
const t = core.getText(11);
const tokens = core.annotate(t.raw_text);
const groups = [[]];
for (const tk of tokens) {
  if (tk.label === "punct" && tk.text.includes("\n")) {
    if (groups[groups.length-1].length) groups.push([]);
    continue;
  }
  groups[groups.length-1].push(tk);
}
while (groups.length && !groups[groups.length-1].length) groups.pop();
const paras = groups.map(g => { const f=g[0], l=g[g.length-1]; return t.raw_text.slice(f.start, l.start+l.text.length).trim(); });
console.log("paras:", paras.length);
const p55 = paras[55] || "";
const h = crypto.createHash("sha256").update(p55).digest("hex");
console.log("computed hash pi55:", h);
console.log("stored hash       :", "96c7fc2fb024d0c60ca620da335d519a2f8f16162a6025ea2a24cdffe786724b");
console.log("match:", h === "96c7fc2fb024d0c60ca620da335d519a2f8f16162a6025ea2a24cdffe786724b");
console.log("p55 head:", JSON.stringify(p55.slice(0,80)));
core.user.close();

