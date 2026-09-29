const fs = require("fs");
const fp = "core.cjs";
let s = fs.readFileSync(fp, "utf8");
if (s.includes("assessmentStart(blueprintId)")) { console.log("already"); process.exit(0); }
const anchor = `  shadowDismiss(id) {
    const r = this.user.prepare(
      "UPDATE shadow_sentences SET status='dismissed' WHERE id=? AND status='active'").run(Number(id));
    return r.changes > 0;
  }
`;
if (!s.includes(anchor)) throw new Error("anchor missing");
const methods = fs.readFileSync("spike-v5/s12-core-methods.txt", "utf8");
s = s.replace(anchor, anchor + "\n" + methods);
fs.writeFileSync(fp, s, "utf8");
console.log("core S12 methods inserted");
