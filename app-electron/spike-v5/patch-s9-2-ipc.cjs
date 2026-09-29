// S9-2 IPC 三层接线：resumePut / resumeGet（v2：api.ts 锚点按实际多行签名）
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
let n = 0;
function patch(rel, oldStr, newStr, label) {
  const fp = path.join(root, rel);
  let s = fs.readFileSync(fp, "utf8");
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失 [" + rel + "]: " + label);
  fs.writeFileSync(fp, s.replace(oldStr, newStr), "utf8");
  n++; console.log("patched:", label);
}

patch("main.cjs",
`      sessionClose: ({ sessionKey, activeMs, amount, locator }) =>
        core.closeSession(sessionKey, { activeMs, amount, locator }),`,
`      sessionClose: ({ sessionKey, activeMs, amount, locator }) =>
        core.closeSession(sessionKey, { activeMs, amount, locator }),
      resumePut: ({ scope, refId, locator, contentHash }) =>
        core.saveResumeState(scope, refId, locator, contentHash),
      resumeGet: ({ scope }) => core.getResumeState(scope),`,
"main map");

const pre = path.join(root, "preload.cjs");
const ps = fs.readFileSync(pre, "utf8");
const m = ps.match(/[^\n]*sessionClose[^\n]*/);
if (!m) throw new Error("preload sessionClose 未找到");
patch("preload.cjs", m[0], m[0] + `
  resumePut: (scope, refId, locator, contentHash) => call("resumePut", { scope, refId, locator, contentHash }),
  resumeGet: (scope) => call("resumeGet", { scope }),`, "preload bridge");

patch("src/api.ts",
`  sessionClose: (sessionKey: string, activeMs: number, amount: number, locator?: Record<string, unknown>
) => Promise<SessionDto | null>;`,
`  sessionClose: (sessionKey: string, activeMs: number, amount: number, locator?: Record<string, unknown>
) => Promise<SessionDto | null>;
  resumePut(scope: "reading" | "shadow", refId: string, locator: Record<string, unknown>, contentHash?: string): Promise<ResumeState>;
  resumeGet(scope: "reading" | "shadow"): Promise<ResumeState | null>;`,
"api methods");

patch("src/api.ts",
"export interface SessionDto {",
`export interface ResumeState {
  scope: "reading" | "shadow";
  refId: string;
  locator: { pi?: number; ch?: number; [k: string]: unknown };
  contentHash: string;
  updatedAt: number;
}
export interface SessionDto {`,
"api ResumeState");

console.log("完成", n);
