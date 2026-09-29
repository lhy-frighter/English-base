const fs = require("fs");
const fp = "src/api.ts";
let s = fs.readFileSync(fp, "utf8");
if (s.includes("assessmentStart:")) { console.log("already"); process.exit(0); }
const anchor = `  feedImport: (p: { feedId: string; guid: string }) => Promise<{ textId: number; duplicated?: boolean; title: string; truncated?: boolean; chars: number }>;
};`;
if (!s.includes(anchor)) throw new Error("anchor missing");
const add = `  feedImport: (p: { feedId: string; guid: string }) => Promise<{ textId: number; duplicated?: boolean; title: string; truncated?: boolean; chars: number }>;
  // —— S12 平行文本能力测评 ——
  assessmentBlueprints: () => Promise<AssessmentBlueprint[]>;
  assessmentStart: (blueprintId: string) => Promise<AssessmentStart>;
  assessmentFinish: (p: {
    formId: string; activeMs: number; lookups: number; translatedParas: number; answers: number[];
  }) => Promise<AssessmentResult>;
  assessmentHistory: (limit?: number) => Promise<AssessmentHistoryItem[]>;
};

// —— S12 平行文本能力测评 ——
export interface AssessmentBlueprint {
  id: string; cefr: string; domain: string; name: string;
  recWpm: number; forms_total: number; forms_left: number;
}
export interface AssessmentQuestion {
  q: string; options: string[]; answer: number; pi: number;
}
export interface AssessmentStart {
  form_id: string; blueprint: string; cefr: string; title: string;
  questions: AssessmentQuestion[];
  coverage: { rate: number; total: number; known: number };
}
export interface AssessmentResult {
  score: number; blueprint: string; form: string;
  correct: number; questions: number; wpm: number; active_ms: number;
  lookups: number; translated_paras: number;
  comp: number; coverage: number; speed: number; dependence: number;
  formula: string; bankVersion: string;
}
export interface AssessmentHistoryItem {
  cefr: string; score: number; created_at: number;
  wpm: number; correct: number; questions: number;
  comp: number; coverage: number; speed: number; dependence: number;
}`;
s = s.replace(anchor, add);
fs.writeFileSync(fp, s, "utf8");
console.log("api.ts S12 methods added");
