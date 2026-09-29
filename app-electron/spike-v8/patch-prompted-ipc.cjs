const fs = require("fs");

// main.cjs
{
  const mp = "D:/vibe coding/英语学习/app-electron/main.cjs";
  let m = fs.readFileSync(mp, "utf8");
  const a = "      detectUsedAssets: (p) => core.detectUsedAssets(p),\n";
  if (m.indexOf(a) === -1) throw new Error("main anchor missing");
  if (m.indexOf("assetUseCounts:") === -1) {
    m = m.replace(a, a + "      assetUseCounts: ({ assetId }) => core.assetUseCounts(assetId),\n");
    fs.writeFileSync(mp, m); console.log("main patched");
  } else console.log("main already");
}

// preload.cjs
{
  const pp = "D:/vibe coding/英语学习/app-electron/preload.cjs";
  let p = fs.readFileSync(pp, "utf8");
  const a = '  detectUsedAssets: (inp) => call("detectUsedAssets", inp),\n';
  if (p.indexOf(a) === -1) throw new Error("preload anchor missing");
  if (p.indexOf("assetUseCounts:") === -1) {
    p = p.replace(a, a + '  assetUseCounts: (assetId) => call("assetUseCounts", { assetId }),\n');
    fs.writeFileSync(pp, p); console.log("preload patched");
  } else console.log("preload already");
}

// api.ts
{
  const ap = "D:/vibe coding/英语学习/app-electron/src/api.ts";
  let s = fs.readFileSync(ap, "utf8");
  if (s.indexOf("assetUseCounts:") !== -1) { console.log("api already"); }
  else {
    const a = "  detectUsedAssets: (p: { sessionKey: string; turnKey: string; text: string; }) =>\n" +
      "    Promise<{ asset_id: number; result: EvidenceResult; replayed: boolean; }[]>;\n";
    if (s.indexOf(a) === -1) throw new Error("api anchor missing");
    const add =
      "  detectUsedAssets: (p: { sessionKey: string; turnKey: string; text: string;\n" +
      "    prompted?: number[]; }) =>\n" +
      "    Promise<{ asset_id: number; result: EvidenceResult; replayed: boolean; }[]>;\n" +
      "  assetUseCounts: (assetId: number) => Promise<{\n" +
      "    used_spontaneously: number; used_prompted: number;\n" +
      "    used_after_correction: number; recognized: number;\n" +
      "  }>;\n";
    s = s.replace(a, add);
    fs.writeFileSync(ap, s); console.log("api patched");
  }
}
