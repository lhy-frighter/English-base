const fs = require("fs");
// main.cjs
{
  const fp = "main.cjs";
  let s = fs.readFileSync(fp, "utf8");
  if (!s.includes("assessmentBlueprints")) {
    const anchor = `      shadowDismiss: (id) => core.shadowDismiss(id),
`;
    if (!s.includes(anchor)) throw new Error("main anchor missing");
    s = s.replace(anchor, anchor + `      assessmentBlueprints: () => core.assessmentBlueprints(),
      assessmentStart: (id) => core.assessmentStart(id),
      assessmentFinish: (p) => core.assessmentFinish(p),
      assessmentHistory: (limit) => core.assessmentHistory(limit),
`);
    fs.writeFileSync(fp, s, "utf8");
    console.log("main patched");
  } else console.log("main skip");
}
// preload.cjs
{
  const fp = "preload.cjs";
  let s = fs.readFileSync(fp, "utf8");
  if (!s.includes("assessmentBlueprints")) {
    const anchor = `  shadowDismiss: (id) => call("shadowDismiss", id),
`;
    if (!s.includes(anchor)) throw new Error("preload anchor missing");
    s = s.replace(anchor, anchor + `  assessmentBlueprints: () => call("assessmentBlueprints"),
  assessmentStart: (id) => call("assessmentStart", id),
  assessmentFinish: (p) => call("assessmentFinish", p),
  assessmentHistory: (limit) => call("assessmentHistory", { limit }),
`);
    fs.writeFileSync(fp, s, "utf8");
    console.log("preload patched");
  } else console.log("preload skip");
}
