// S11-c IPC（main.cjs + preload.cjs）
const fs = require("fs");

let m = fs.readFileSync("main.cjs", "utf8");
const mOld = `      recycleCandidates: (p) => core.recycleCandidates(p),
      recycleAdd: (p) => core.recycleAdd(p),`;
const mNew = `      recycleCandidates: (p) => core.recycleCandidates(p),
      recycleAdd: (p) => core.recycleAdd(p),
      shadowPractice: (p) => core.shadowPractice(p),
      shadowDue: (p) => core.shadowDue(p?.limit),
      shadowDismiss: (id) => core.shadowDismiss(id),`;
if (!m.includes("shadowPractice")) {
  if (!m.includes(mOld)) throw new Error("main anchor missing");
  m = m.replace(mOld, mNew);
  fs.writeFileSync("main.cjs", m, "utf8");
  console.log("main patched");
} else console.log("main skip");

let p = fs.readFileSync("preload.cjs", "utf8");
const pOld = `  recycleCandidates: (p) => call("recycleCandidates", p),
  recycleAdd: (words) => call("recycleAdd", words),`;
const pNew = `  recycleCandidates: (p) => call("recycleCandidates", p),
  recycleAdd: (words) => call("recycleAdd", words),
  shadowPractice: (p) => call("shadowPractice", p),
  shadowDue: (limit) => call("shadowDue", { limit }),
  shadowDismiss: (id) => call("shadowDismiss", id),`;
if (!p.includes("shadowPractice")) {
  if (!p.includes(pOld)) throw new Error("preload anchor missing");
  p = p.replace(pOld, pNew);
  fs.writeFileSync("preload.cjs", p, "utf8");
  console.log("preload patched");
} else console.log("preload skip");
