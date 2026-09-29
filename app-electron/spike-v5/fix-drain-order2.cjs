const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/tts-chunks.ts";
let s = fs.readFileSync(p, "utf8");

const startMark = `export function drainSentences(buffer: string): { ready: string[]; rest: string } {`;
const endMark = `  return { ready, rest: unmask(rest) };\n}`;
const i = s.indexOf(startMark);
const j = s.indexOf(endMark, i);
if (i < 0 || j < 0) throw new Error("markers missing " + i + " " + j);
const next = [
  startMark,
  "  const masked = maskProtected(buffer);",
  "  const parts = masked.split(/(?<=[.!?…])[ \\t]+|\\r?\\n+/);",
  "  const ready: string[] = [];",
  '  let rest = "";',
  "  for (let k = 0; k < parts.length; k++) {",
  "    const t = unmask(parts[k]).trim();",
  '    if (!t) continue;',
  "    if (k === parts.length - 1 && !/[.!?…]\\s*$/.test(parts[k])) rest = t;",
  "    else ready.push(t);",
  "  }",
  "  return { ready, rest };",
  "}",
].join("\n");
s = s.slice(0, i) + next + s.slice(j + endMark.length);
fs.writeFileSync(p, s);
console.log("drainSentences rewritten");
