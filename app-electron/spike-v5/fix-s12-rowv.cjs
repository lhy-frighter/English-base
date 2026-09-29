const fs = require("fs");
const fp = "core.cjs";
let s = fs.readFileSync(fp, "utf8");
const a = `try { arr = row ? JSON.parse(row.value) : []; } catch { arr = []; }`;
const b = `try { arr = row ? JSON.parse(row.v) : []; } catch { arr = []; }`;
if (!s.includes(a)) throw new Error("anchor missing");
s = s.replace(a, b);
fs.writeFileSync(fp, s, "utf8");
console.log("row.v fixed");
