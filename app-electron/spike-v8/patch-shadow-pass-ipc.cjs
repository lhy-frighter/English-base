const fs = require("fs");

// main.cjs
{
  const mp = "D:/vibe coding/英语学习/app-electron/main.cjs";
  let m = fs.readFileSync(mp, "utf8");
  const a = "      priorityList: (p) => core.priorityList(p || {}),\n";
  if (m.indexOf(a) === -1) throw new Error("main anchor missing");
  if (m.indexOf("shadowPassedForSentences:") === -1) {
    m = m.replace(a, a +
      "      shadowPassedForSentences: (p) => core.shadowPassedForSentences(p || {}),\n" +
      "      shadowPassedForTurn: ({ turnId }) => core.shadowPassedForTurn(turnId),\n");
    fs.writeFileSync(mp, m); console.log("main patched");
  } else console.log("main already");
}

// preload.cjs
{
  const pp = "D:/vibe coding/英语学习/app-electron/preload.cjs";
  let p = fs.readFileSync(pp, "utf8");
  const a = '  priorityList: (p) => call("priorityList", p),\n';
  if (p.indexOf(a) === -1) throw new Error("preload anchor missing");
  if (p.indexOf("shadowPassedForSentences:") === -1) {
    p = p.replace(a, a +
      '  shadowPassedForSentences: (sentences) => call("shadowPassedForSentences", { sentences }),\n' +
      '  shadowPassedForTurn: (turnId) => call("shadowPassedForTurn", { turnId }),\n');
    fs.writeFileSync(pp, p); console.log("preload patched");
  } else console.log("preload already");
}

// api.ts
{
  const ap = "D:/vibe coding/英语学习/app-electron/src/api.ts";
  let s = fs.readFileSync(ap, "utf8");
  if (s.indexOf("shadowPassedForSentences:") !== -1) { console.log("api already"); }
  else {
    const a = "  priorityList: (p?: { limit?: number; kinds?: string[]; }) => Promise<PriorityDto[]>;\n";
    if (s.indexOf(a) === -1) throw new Error("api anchor missing");
    const add = a +
      "  shadowPassedForSentences: (sentences: string[]) => Promise<boolean[]>;\n" +
      "  shadowPassedForTurn: (turnId: string) => Promise<boolean>;\n";
    s = s.replace(a, add);
    fs.writeFileSync(ap, s); console.log("api patched");
  }
}
