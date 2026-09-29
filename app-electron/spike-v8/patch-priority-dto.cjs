const fs = require("fs");

// 1) core priorityList：结果带 canonical/gloss/asset_kind
{
  const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
  let s = fs.readFileSync(cp, "utf8");
  const old =
    "    const out = rows.map((r) => this.assetPriority(r.id)).filter((p) => p.score > 0);\n" +
    "    out.sort((x, y) => (y.score - x.score) || (y.asset_id - x.asset_id));\n" +
    "    return out.slice(0, limit);";
  const neu =
    "    const out = rows.map((r) => {\n" +
    "      const p = this.assetPriority(r.id);\n" +
    "      const row = this.user.prepare(\n" +
    "        \"SELECT canonical,gloss,asset_kind FROM learning_assets WHERE id=?\").get(r.id);\n" +
    "      return Object.assign(p, row);\n" +
    "    }).filter((p) => p.score > 0);\n" +
    "    out.sort((x, y) => (y.score - x.score) || (y.asset_id - x.asset_id));\n" +
    "    return out.slice(0, limit);";
  if (s.indexOf(old) === -1) throw new Error("core list anchor missing");
  if (s.indexOf(neu) === -1) { s = s.replace(old, neu); fs.writeFileSync(cp, s); console.log("core patched"); }
  else console.log("core already");
}

// 2) api.ts PriorityDto 加字段
{
  const ap = "D:/vibe coding/英语学习/app-electron/src/api.ts";
  let s = fs.readFileSync(ap, "utf8");
  const old =
    "export interface PriorityDto {\n" +
    "  asset_id: number; score: number; parts: PriorityParts;\n" +
    "  reasons: string[]; algo: string;\n" +
    "}";
  const neu =
    "export interface PriorityDto {\n" +
    "  asset_id: number; score: number; parts: PriorityParts;\n" +
    "  reasons: string[]; algo: string;\n" +
    "  canonical: string; gloss: string; asset_kind: string;\n" +
    "}";
  if (s.indexOf(old) === -1) throw new Error("api dto anchor missing");
  if (s.indexOf(neu) === -1) { s = s.replace(old, neu); fs.writeFileSync(ap, s); console.log("api patched"); }
  else console.log("api already");
}

// 3) conversation-prompt.ts：weakAssets 参数
{
  const pp = "D:/vibe coding/英语学习/app-electron/src/conversation/conversation-prompt.ts";
  let s = fs.readFileSync(pp, "utf8");
  let changed = false;
  const oldSig =
    "export function systemPrompt(\n" +
    "  topic: ConvSession[\"topic\"],\n" +
    "  forSummary = false,\n" +
    "  mode: TutorMode = \"auto\",\n" +
    "): string {";
  const neuSig =
    "export interface WeakAssetSeed { canonical: string; gloss?: string; kind: string; }\n" +
    "export function systemPrompt(\n" +
    "  topic: ConvSession[\"topic\"],\n" +
    "  forSummary = false,\n" +
    "  mode: TutorMode = \"auto\",\n" +
    "  weakAssets?: WeakAssetSeed[],\n" +
    "): string {";
  if (s.indexOf(oldSig) === -1) throw new Error("sig anchor missing");
  if (s.indexOf(neuSig) === -1) { s = s.replace(oldSig, neuSig); changed = true; }

  const oldRet =
    "  return lines.join(\"\\n\");\n}";
  // 实际可能是 join(" ")，分别处理
  const tailCandidates = [
    "  return lines.join(\" \");\n}",
    "  return lines.join(\"\\n\");\n}",
  ];
  let tail = tailCandidates.find((t) => s.indexOf(t) !== -1);
  if (!tail) throw new Error("tail anchor missing");
  const newTail =
    "  if (!forSummary && weakAssets && weakAssets.length) {\n" +
    "    lines.push(`When natural, weave in these review items and invite the learner to use them: \" +
    "weakAssets.map((w) => `\\u201c${w.canonical}\\u201d`).join(\", \") +\n" +
    "      `. Use of an item after your invitation is prompted practice; do not label it spontaneous.`);\n" +
    "  }\n" + tail;
  if (s.indexOf(newTail) === -1) { s = s.replace(tail, newTail); changed = true; }
  if (changed) { fs.writeFileSync(pp, s); console.log("prompt patched"); }
  else console.log("prompt already");
}
