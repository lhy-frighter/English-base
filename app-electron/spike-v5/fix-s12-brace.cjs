const fs = require("fs");
const fp = "src/App.tsx";
let s = fs.readFileSync(fp, "utf8");
const bad = `{tab === "dash" && <DashPage onAssess={() => setAssessView(true)} />
        {assessView && <AssessPage`;
const good = `{tab === "dash" && <DashPage onAssess={() => setAssessView(true)} />}
        {assessView && <AssessPage`;
if (!s.includes(bad)) throw new Error("bad missing");
s = s.replace(bad, good);
fs.writeFileSync(fp, s, "utf8");
console.log("brace fixed");
