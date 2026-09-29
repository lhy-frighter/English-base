const fs = require("fs");

// main
{
  const mp = "D:/vibe coding/英语学习/app-electron/main.cjs";
  let m = fs.readFileSync(mp, "utf8");
  const a = "      priorityList: (p) => core.priorityList(p || {}),\n";
  if (m.indexOf(a) === -1) throw new Error("main anchor");
  if (m.indexOf("examWeakList:") === -1) {
    m = m.replace(a, a + "      examWeakList: (p) => core.examWeakList(p || {}),\n");
    fs.writeFileSync(mp, m); console.log("main patched");
  } else console.log("main already");
}

// preload
{
  const pp = "D:/vibe coding/英语学习/app-electron/preload.cjs";
  let p = fs.readFileSync(pp, "utf8");
  const a = '  priorityList: (p) => call("priorityList", p),\n';
  if (p.indexOf(a) === -1) throw new Error("preload anchor");
  if (p.indexOf("examWeakList:") === -1) {
    p = p.replace(a, a + '  examWeakList: (p) => call("examWeakList", p),\n');
    fs.writeFileSync(pp, p); console.log("preload patched");
  } else console.log("preload already");
}

// api
{
  const ap = "D:/vibe coding/英语学习/app-electron/src/api.ts";
  let s = fs.readFileSync(ap, "utf8");
  if (s.indexOf("examWeakList:") !== -1) { console.log("api already"); }
  else {
    const a = "  shadowPassedForTurn: (turnId: string) => Promise<boolean>;\n";
    if (s.indexOf(a) === -1) throw new Error("api anchor");
    const add = a +
      "  examWeakList: (p?: { limit?: number }) => Promise<ExamWeakItem[]>;\n";
    s = s.replace(a, add);
    // 类型定义（放在 PriorityDto 附近）
    const tAnchor = "export interface PriorityDto {";
    const tAdd =
      "export interface ExamWeakItem {\n" +
      "  id: number;\n" +
      "  paper_id: number;\n" +
      "  q_index: number;\n" +
      "  paper_title: string;\n" +
      "  reason: string;\n" +
      "  stem: string;\n" +
      "  section_kind: string;\n" +
      "  answer: string;\n" +
      "  point: string;\n" +
      "  is_listening: boolean;\n" +
      "}\n\n";
    s = s.replace(tAnchor, tAdd + tAnchor);
    fs.writeFileSync(ap, s); console.log("api patched");
  }
}
