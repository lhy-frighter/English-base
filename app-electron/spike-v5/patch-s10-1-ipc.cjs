// S10-1 IPC + preload + api.ts：insights / dayTimeline
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
"      todayBrief: () => core.todayBrief(),",
`      todayBrief: () => core.todayBrief(),
      insights: ({ days } = {}) => core.insights(days),
      dayTimeline: ({ key } = {}) => core.dayTimeline(key),`,
"main");
patch("preload.cjs",
"  todayBrief: () => call(\"todayBrief\"),",
`  todayBrief: () => call("todayBrief"),
  insights: (days) => call("insights", { days }),
  dayTimeline: (key) => call("dayTimeline", { key }),`,
"preload");
patch("src/api.ts",
"  todayBrief: () => Promise<TodayBrief>;",
`  todayBrief: () => Promise<TodayBrief>;
  insights: (days?: number) => Promise<Insights>;
  dayTimeline: (key: string) => Promise<DayTimeline>;`,
"api 方法");
patch("src/api.ts",
"export interface ResumeState {",
`export type InsightDay = {
  key: string; label: string;
  minutes: { read: number; shadow: number; review: number; exam: number };
  counts: { lookup: number; note: number; translation: number };
  reviews: number; readWords: number; shadowSentences: number; examPapers: number; valid: boolean;
};
export type CoveragePoint = {
  key: string; kind: string; cefr: string; rate: number; total: number; known: number;
  textId: number | null; title: string | null; deleted: boolean;
};
export interface Insights {
  range_days: number;
  days: InsightDay[];
  totals: {
    minutes: { read: number; shadow: number; review: number; exam: number };
    counts: { lookup: number; note: number; translation: number };
    reviews: number; readWords: number; shadowSentences: number; examPapers: number;
  };
  streak: { current: number; longest: number };
  coverage: CoveragePoint[];
  history_note: string;
}
export type TimelineEntry = {
  kind: string; ts?: number | null; title?: string; refType?: string; refId?: string;
  deleted?: boolean; amount?: number; unit?: string; minutes?: number; status?: string;
};
export interface DayTimeline { key: string; valid: boolean; entries: TimelineEntry[]; }

export interface ResumeState {`,
"api 类型");
console.log("完成", n);
