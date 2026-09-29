// S11-c api.ts 类型与方法
const fs = require("fs");
const fp = "src/api.ts";
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

rep(
`  wrong_due: number;  recycle_multi: number;
  recycle_total: number;
}`,
`  wrong_due: number;  recycle_multi: number;
  recycle_total: number;
  shadow_due: number;
}

// S11-c 跟读句 1/3/7 轻量复习
export interface ShadowDueItem {
  id: number; sentence: string; textId: number | null; sourceTitle: string;
  stage: number; dueAt: number; practiceCount: number; bestSimilarity: number; overdueMs: number;
}
export interface ShadowPracticeResult {
  hash: string; isNew: boolean; advanced: boolean; graduated: boolean;
  stage: number; status: "active" | "graduated" | "dismissed"; dueAt: number; sentence: string;
}`,
"类型");

rep(
`  recycleCandidates: (p?: { minTexts?: number; limit?: number; offset?: number }) => Promise<RecyclePage>;
  recycleAdd: (words: string[]) => Promise<RecycleAddResult>;`,
`  recycleCandidates: (p?: { minTexts?: number; limit?: number; offset?: number }) => Promise<RecyclePage>;
  recycleAdd: (words: string[]) => Promise<RecycleAddResult>;
  shadowPractice: (p: { sentence: string; textId?: number | null; title?: string; similarity?: number }) => Promise<ShadowPracticeResult>;
  shadowDue: (limit?: number) => Promise<ShadowDueItem[]>;
  shadowDismiss: (id: number) => Promise<boolean>;`,
"api 方法");

fs.writeFileSync(fp, s, "utf8");
console.log("api.ts saved");
