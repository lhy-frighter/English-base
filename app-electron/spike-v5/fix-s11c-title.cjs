// core：title 为空但 textId 存在时，从 texts 表补来源标题
const fs = require("fs");
const fp = "core.cjs";
let s = fs.readFileSync(fp, "utf8");
const oldStr = `    const tid = textId == null ? null : Number(textId);
    const ttl = String(title || "");`;
const newStr = `    const tid = textId == null ? null : Number(textId);
    let ttl = String(title || "");
    if (!ttl && tid != null) {
      const tr = this.user.prepare("SELECT title FROM texts WHERE id=?").get(tid);
      if (tr) ttl = String(tr.title || "");
    }`;
if (s.includes(newStr)) console.log("skip");
else {
  if (!s.includes(oldStr)) throw new Error("anchor missing");
  s = s.replace(oldStr, newStr);
  fs.writeFileSync(fp, s, "utf8");
  console.log("patched");
}
