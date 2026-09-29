const fs = require("fs");

// main.cjs
{
  const mp = "D:/vibe coding/英语学习/app-electron/main.cjs";
  let m = fs.readFileSync(mp, "utf8");
  const a = "      assetUseCounts: ({ assetId }) => core.assetUseCounts(assetId),\n";
  if (m.indexOf(a) === -1) throw new Error("main anchor missing");
  if (m.indexOf("priorityList:") === -1) {
    m = m.replace(a, a + "      priorityList: (p) => core.priorityList(p || {}),\n");
    fs.writeFileSync(mp, m); console.log("main patched");
  } else console.log("main already");
}

// preload.cjs
{
  const pp = "D:/vibe coding/英语学习/app-electron/preload.cjs";
  let p = fs.readFileSync(pp, "utf8");
  const a = '  assetUseCounts: (assetId) => call("assetUseCounts", { assetId }),\n';
  if (p.indexOf(a) === -1) throw new Error("preload anchor missing");
  if (p.indexOf("priorityList:") === -1) {
    p = p.replace(a, a + '  priorityList: (p) => call("priorityList", p),\n');
    fs.writeFileSync(pp, p); console.log("preload patched");
  } else console.log("preload already");
}

// api.ts
{
  const ap = "D:/vibe coding/英语学习/app-electron/src/api.ts";
  let s = fs.readFileSync(ap, "utf8");
  if (s.indexOf("priorityList:") !== -1) { console.log("api already"); }
  else {
    const a = "  assetUseCounts: (assetId: number) => Promise<{\n" +
      "    used_spontaneously: number; used_prompted: number;\n" +
      "    used_after_correction: number; recognized: number;\n" +
      "  }>;\n";
    if (s.indexOf(a) === -1) throw new Error("api anchor missing");
    const add = a +
      "  priorityList: (p?: { limit?: number; kinds?: string[]; }) => Promise<PriorityDto[]>;\n";
    // 插入 PriorityDto 类型（放在 api 类型区，简单放在 interface 外不行——直接定义 export interface）
    const typeAdd = "export interface PriorityParts {\n" +
      "  overdue: number; recurrence: number; recent_error: number;\n" +
      "  exam: number; output_gap: number; success_decay: number;\n" +
      "}\n" +
      "export interface PriorityDto {\n" +
      "  asset_id: number; score: number; parts: PriorityParts;\n" +
      "  reasons: string[]; algo: string;\n" +
      "}\n\n";
    s = s.replace(a, add);
    // 在文件首个 "export interface" 前插入类型定义
    const fi = s.indexOf("export interface");
    s = s.slice(0, fi) + typeAdd + s.slice(fi);
    fs.writeFileSync(ap, s); console.log("api patched");
  }
}
