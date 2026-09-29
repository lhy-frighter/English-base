const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "src", "api.ts");
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(a, b, label) {
  if (s.includes(b)) { console.log("skip:", label); return; }
  if (!s.includes(a)) throw new Error("锚点缺失: " + label);
  s = s.replace(a, b); n++; console.log("patched:", label);
}
rep('  sessionClose: (sessionKey: string, activeMs: number, amount: number, locator?: Record<string, unknown>) => Promise<SessionDto | null>;',
'  sessionClose: (sessionKey: string, activeMs: number, amount: number, locator?: Record<string, unknown>) => Promise<SessionDto | null>;\n  resumePut: (scope: "reading" | "shadow", refId: string, locator: Record<string, unknown>, contentHash?: string) => Promise<ResumeState>;\n  resumeGet: (scope: "reading" | "shadow") => Promise<ResumeState | null>;',
"api methods");
rep("export interface SessionDto {",
`export interface ResumeState {
  scope: "reading" | "shadow";
  refId: string;
  locator: { pi?: number; ch?: number; [k: string]: unknown };
  contentHash: string;
  updatedAt: number;
}
export interface SessionDto {`,
"api ResumeState");
fs.writeFileSync(fp, s, "utf8");
console.log("done", n);
