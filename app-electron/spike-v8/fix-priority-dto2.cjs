const fs = require("fs");

// core priorityList
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

// api PriorityDto
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
