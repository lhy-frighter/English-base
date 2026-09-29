// S9-3 IPC + preload + api.ts 接线 todayBrief
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
let n = 0;
function patch(rel, oldStr, newStr, label) {
  const fp = path.join(root, rel);
  let s = fs.readFileSync(fp, "utf8");
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  fs.writeFileSync(fp, s.replace(oldStr, newStr), "utf8");
  n++; console.log("patched:", label);
}
patch("main.cjs",
'      counts: () => core.counts(),',
'      counts: () => core.counts(),\n      todayBrief: () => core.todayBrief(),',
"main");
patch("preload.cjs",
'  counts: () => call("counts"),',
'  counts: () => call("counts"),\n  todayBrief: () => call("todayBrief"),',
"preload");
// api.ts：在 ResumeState 相关方法旁加类型与方法（找 resumeGet 行）
patch("src/api.ts",
'resumeGet: (scope: "reading" | "shadow") => Promise<ResumeState | null>;',
`resumeGet: (scope: "reading" | "shadow") => Promise<ResumeState | null>;
  todayBrief: () => Promise<TodayBrief>;`,
"api 方法");
patch("src/api.ts",
"export interface ResumeState {",
`export interface TodayBrief {
  primary: "review" | "reading" | "feed";
  due_cards: number;
  fresh_today: number;
  queue: number;
  est_minutes: number;
  resume: { refId: string; title: string; pi: number; ch: number } | null;
  wrong_due: number;
}

export interface ResumeState {`,
"api 类型");
console.log("完成", n);
