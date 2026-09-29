const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/tts-chunks.ts";
let s = fs.readFileSync(p, "utf8");

const old = `export function drainSentences(buffer: string): { ready: string[]; rest: string } {
  const masked = maskProtected(buffer);
  const parts = masked.split(/(?<=[.!?…])[ \t]+|\r?\n+/);
  const ready: string[] = [];
  let rest = parts.pop() ?? "";
  if (/[.!?…]\s*$/.test(rest)) {
    const t = unmask(rest).trim();
    if (t) ready.push(t);
    rest = "";
  }
  for (const part of parts) {
    const t = unmask(part).trim();
    if (t) ready.push(t);
  }
  return { ready, rest: unmask(rest) };
}`;
const next = `export function drainSentences(buffer: string): { ready: string[]; rest: string } {
  const masked = maskProtected(buffer);
  const parts = masked.split(/(?<=[.!?…])[ \t]+|\r?\n+/);
  const ready: string[] = [];
  let rest = "";
  for (let i = 0; i < parts.length; i++) {
    const t = unmask(parts[i]).trim();
    if (!t) continue;
    if (i === parts.length - 1 && !/[.!?…]\s*$/.test(parts[i])) rest = t;
    else ready.push(t);
  }
  return { ready, rest };
}`;
if (!s.includes(old)) throw new Error("drainSentences block missing");
s = s.replace(old, next);
fs.writeFileSync(p, s);
console.log("drainSentences order fixed");
