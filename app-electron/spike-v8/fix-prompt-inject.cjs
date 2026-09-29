const fs = require("fs");
const pp = "D:/vibe coding/英语学习/app-electron/src/conversation/conversation-prompt.ts";
let s = fs.readFileSync(pp, "utf8");
let changed = false;

// 签名
{
  const old =
    "export function systemPrompt(\n" +
    "  topic: ConvSession[\"topic\"],\n" +
    "  forSummary = false,\n" +
    "  mode: TutorMode = \"auto\",\n" +
    "): string {";
  const neu =
    "export interface WeakAssetSeed { canonical: string; gloss?: string; kind: string; }\n" +
    "export function systemPrompt(\n" +
    "  topic: ConvSession[\"topic\"],\n" +
    "  forSummary = false,\n" +
    "  mode: TutorMode = \"auto\",\n" +
    "  weakAssets?: WeakAssetSeed[],\n" +
    "): string {";
  if (s.indexOf(old) === -1) throw new Error("sig anchor missing");
  if (s.indexOf(neu) === -1) { s = s.replace(old, neu); changed = true; console.log("sig"); }
}

// 尾部注入（在 return lines.join 前）
{
  const old = "  return lines.join(\" \");\n}";
  const injection = [
    "  if (!forSummary && weakAssets && weakAssets.length) {",
    "    const seeds = weakAssets.map((w) => '“' + w.canonical + '”').join(', ');",
    "    lines.push('When natural, weave in these review items and invite the learner to use them: ' + seeds + '. Use of an item after your invitation is prompted practice; do not label it spontaneous.');",
    "  }",
    "",
  ].join("\n");
  if (s.indexOf(old) === -1) throw new Error("tail anchor missing");
  if (s.indexOf("WeakAssetSeed[]") !== -1 && s.indexOf(injection) === -1) {
    s = s.replace(old, injection + old); changed = true; console.log("tail");
  }
}

if (changed) { fs.writeFileSync(pp, s); console.log("written"); }
else console.log("no changes");
