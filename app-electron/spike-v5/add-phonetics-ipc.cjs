const fs = require("fs");

// 1) core.cjs: phoneticsFor
{
  const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
  let s = fs.readFileSync(p, "utf8");
  if (s.includes("phoneticsFor(")) throw new Error("core already");
  const anchor = "  lookupWordRow(alias, w) {";
  const method = [
    "  // 批量取音标（不记 lookup 日志）：供「转为练习」发音资产自动填 IPA。",
    "  phoneticsFor(wordsArr) {",
    "    const out = [];",
    "    for (const w0 of wordsArr) {",
    "      const w = String(w0 || \"\").toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, \"\");",
    "      if (!w) { out.push(null); continue; }",
    "      let row = this.lookupWordRow(\"dict\", w);",
    "      if (!row) {",
    "        let lem = this.lemmaOf.get(w);",
    "        if (!lem) { try { lem = this.ruleLemma(w); } catch { lem = null; } }",
    "        if (lem) row = this.lookupWordRow(\"dict\", lem);",
    "      }",
    "      out.push(row?.phonetic || null);",
    "    }",
    "    return out;",
    "  }",
    "",
  ].join("\n");
  s = s.replace(anchor, method + anchor);
  fs.writeFileSync(p, s);
  console.log("core phoneticsFor added");
}

// 2) main.cjs cmd 路由
{
  const p = "D:/vibe coding/英语学习/app-electron/main.cjs";
  let s = fs.readFileSync(p, "utf8");
  if (s.includes("phonetics:")) throw new Error("main already");
  const anchor = "captureAsset: (p) => core.captureAsset(p),";
  if (s.indexOf(anchor) < 0) throw new Error("main anchor missing");
  s = s.replace(anchor, anchor + "\n    phonetics: (p) => core.phoneticsFor(p.words),");
  fs.writeFileSync(p, s);
  console.log("main route added");
}

// 3) preload.cjs
{
  const p = "D:/vibe coding/英语学习/app-electron/preload.cjs";
  let s = fs.readFileSync(p, "utf8");
  if (s.includes("phonetics:")) throw new Error("preload already");
  const anchor = "  addPronProductionCard: (assetId) => call(\"addPronProductionCard\", { assetId }),";
  if (s.indexOf(anchor) < 0) throw new Error("preload anchor missing");
  s = s.replace(anchor, anchor + "\n  phonetics: (words) => call(\"phonetics\", { words }),");
  fs.writeFileSync(p, s);
  console.log("preload added");
}
