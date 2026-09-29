// 修复 api.ts：Recycle 类型块误注入 api 对象类型内部
const fs = require("fs");
const fp = "src/api.ts";
let s = fs.readFileSync(fp, "utf8");

const block = `export interface RecycleItem {
  lemma: string; phonetic: string; gloss: string; tag: string; frq: number;
  level: string; levelRank: number; awl: 0 | 1;
  texts: number; total: number; firstSeen: number; lastSeen: number;
  sources: { text_id: number; title: string; count: number }[];
}
export interface RecyclePage { total: number; items: RecycleItem[]; }
export interface RecycleAddResult {
  added: { lemma: string; cards: number }[];
  already: string[];
  skipped: { lemma: string; reason: string }[];
}
`;

// 1) 从 api 对象类型里删掉误注入的块
const inside = `  resumeGet: (scope: "reading" | "shadow") => Promise<ResumeState | null>;
` + block + `  todayBrief: () => Promise<TodayBrief>;`;
const insideFixed = `  resumeGet: (scope: "reading" | "shadow") => Promise<ResumeState | null>;
  todayBrief: () => Promise<TodayBrief>;`;
if (!s.includes(inside)) { console.error("inside anchor missing"); process.exit(1); }
s = s.replace(inside, insideFixed);

// 2) 块移到 export const api 之前（顶层）
if (!s.includes("export interface RecycleItem")) {
  const anchor2 = "export const api = (window as any).electronAPI as {";
  if (!s.includes(anchor2)) { console.error("api anchor missing"); process.exit(1); }
  s = s.replace(anchor2, block + "\n" + anchor2);
}

fs.writeFileSync(fp, s, "utf8");
console.log("api.ts fixed");
