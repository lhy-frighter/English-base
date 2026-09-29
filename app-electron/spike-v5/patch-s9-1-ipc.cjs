// S9-1 IPC 接线：main.cjs / preload.cjs / src/api.ts
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
let n = 0;
function patch(rel, oldStr, newStr, label) {
  const fp = path.join(root, rel);
  let s = fs.readFileSync(fp, "utf8");
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("未找到锚点 [" + rel + "]: " + label);
  fs.writeFileSync(fp, s.replace(oldStr, newStr), "utf8");
  n++; console.log("patched:", label);
}

// main.cjs：handler map（textDelete 之后）
patch("main.cjs",
"      textDelete: ({ id }) => core.deleteText(id),\n",
`      textDelete: ({ id }) => core.deleteText(id),
      sessionBegin: (o) => core.beginSession(o),
      sessionHeartbeat: ({ sessionKey, activeMs, amount, locator }) =>
        core.heartbeatSession(sessionKey, { activeMs, amount, locator }),
      sessionClose: ({ sessionKey, activeMs, amount, locator }) =>
        core.closeSession(sessionKey, { activeMs, amount, locator }),
`,
"main handlers");

// preload.cjs
const pre = path.join(root, "preload.cjs");
let ps = fs.readFileSync(pre, "utf8");
const preAnchor = "  textDelete: (id) => call(\"textDelete\", { id }),";
if (!ps.includes("sessionBegin")) {
  if (!ps.includes(preAnchor)) throw new Error("preload 锚点缺失");
  ps = ps.replace(preAnchor, preAnchor + `
  sessionBegin: (o) => call("sessionBegin", o),
  sessionHeartbeat: (sessionKey, activeMs, amount, locator) => call("sessionHeartbeat", { sessionKey, activeMs, amount, locator }),
  sessionClose: (sessionKey, activeMs, amount, locator) => call("sessionClose", { sessionKey, activeMs, amount, locator }),`);
  fs.writeFileSync(pre, ps, "utf8"); n++; console.log("patched: preload");
} else console.log("skip: preload");

// api.ts：textDelete 类型行之后
const api = path.join(root, "src", "api.ts");
let as = fs.readFileSync(api, "utf8");
const apiAnchor = "  textDelete: (id: number) => Promise<{ deleted: boolean; notes: number; lexemesRemoved: number }>;";
const apiAdd = `
  // S9-1 学习会话（阅读/跟读活跃计时）
  sessionBegin: (o: {
    kind: "read" | "shadow"; sessionKey: string; refType: string; refId: string;
    titleSnapshot?: string; locator?: Record<string, unknown>; contentHash?: string;
    amount?: number; unit?: "words" | "sentences" | "";
  }) => Promise<SessionDto>;
  sessionHeartbeat: (sessionKey: string, activeMs: number, amount: number, locator?: Record<string, unknown>) => Promise<SessionDto>;
  sessionClose: (sessionKey: string, activeMs: number, amount: number, locator?: Record<string, unknown>) => Promise<SessionDto | null>;`;
if (!as.includes("sessionBegin")) {
  if (!as.includes(apiAnchor)) throw new Error("api.ts 锚点缺失");
  // 先补 SessionDto 类型（放在接口体外之前：找 "export interface" 第一个位置）
  if (!as.includes("interface SessionDto")) {
    const ifaceIdx = as.indexOf("export interface");
    if (ifaceIdx < 0) throw new Error("api.ts 找不到 interface");
    as = as.slice(0, ifaceIdx) +
`export interface SessionDto {
  id: number; kind: "read" | "shadow"; sessionKey: string;
  refType: string; refId: string; titleSnapshot: string;
  locator: Record<string, unknown>; contentHash: string;
  amount: number; unit: string; startedAt: number; endedAt: number | null;
  lastActiveAt: number; status: "open" | "closed" | "abandoned"; activeMs: number;
}
` + as.slice(ifaceIdx);
  }
  as = as.replace(apiAnchor, apiAnchor + "\n" + apiAdd);
  fs.writeFileSync(api, as, "utf8"); n++; console.log("patched: api.ts");
} else console.log("skip: api.ts");

console.log("完成", n);
