const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}
R(
  `      let n, d;
      if (row.note_id != null) {`,
  `      let n, d;
      let a = null, payload = {};
      if (row.note_id != null) {`,
  "outer decl"
);
R(
  `        const a = this.user
          .prepare("SELECT asset_kind, canonical, gloss, payload_json FROM learning_assets WHERE id=?")
          .get(row.asset_id);
        const payload = JSON.parse(a.payload_json || "{}");`,
  `        a = this.user
          .prepare("SELECT asset_kind, canonical, gloss, payload_json FROM learning_assets WHERE id=?")
          .get(row.asset_id);
        payload = JSON.parse(a.payload_json || "{}");`,
  "inner assign"
);
fs.writeFileSync(p, s);
console.log("scope fixed");
