const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(cp, "utf8");
let changed = false;

// 1) detectUsedAssets 签名加 prompted
{
  const old = "  detectUsedAssets({ sessionKey, turnKey, text }) {";
  const neu = "  detectUsedAssets({ sessionKey, turnKey, text, prompted }) {";
  if (s.indexOf(old) === -1) throw new Error("sig anchor missing");
  if (s.indexOf(neu) === -1) { s = s.replace(old, neu); changed = true; console.log("sig patched"); }
}

// 2) classify 接受 prompted 标记
{
  const old = `    const classify = (asset, matchedVia, result) => {`;
  const neu = `    const promptedIds = Array.isArray(prompted) ? prompted : [];
    const classify = (asset, matchedVia, result) => {`;
  if (s.indexOf(old) === -1) throw new Error("classify anchor missing");
  if (s.indexOf(neu) === -1) { s = s.replace(old, neu); changed = true; console.log("classify patched"); }
}

// 3) word 循环 result 计算
{
  const old = `      const result = normCorrection && normCorrection.indexOf(canon) !== -1
        ? "used_after_correction" : "used_spontaneously";
      classify(a, canon, result);`;
  const neu = `      const result = promptedIds.includes(a.id)
        ? "used_prompted"
        : (normCorrection && normCorrection.indexOf(canon) !== -1
          ? "used_after_correction" : "used_spontaneously");
      classify(a, canon, result);`;
  if (s.indexOf(old) === -1) throw new Error("word result anchor missing");
  if (s.indexOf(neu) === -1) { s = s.replace(old, neu); changed = true; console.log("word result patched"); }
}

// 4) chunk 循环 result 计算
{
  const old = `      const result = normCorrection && normCorrection.indexOf(hit) !== -1
        ? "used_after_correction" : "used_spontaneously";
      classify(a, hit, result);`;
  const neu = `      const result = promptedIds.includes(a.id)
        ? "used_prompted"
        : (normCorrection && normCorrection.indexOf(hit) !== -1
          ? "used_after_correction" : "used_spontaneously");
      classify(a, hit, result);`;
  if (s.indexOf(old) === -1) throw new Error("chunk result anchor missing");
  if (s.indexOf(neu) === -1) { s = s.replace(old, neu); changed = true; console.log("chunk result patched"); }
}

// 5) assetUseCounts 新方法（插在 detectUsedAssets 之前）
if (s.indexOf("assetUseCounts(") === -1) {
  const anchor = "  // S13-b-1 用出证据检测";
  const add = `  // S13-b-2 资产用出次数（卡背展示）
  assetUseCounts(assetId) {
    const out = {
      used_spontaneously: 0, used_prompted: 0,
      used_after_correction: 0, recognized: 0,
    };
    for (const r of this.user.prepare(
      "SELECT result, COUNT(*) n FROM asset_evidence WHERE asset_id=? GROUP BY result").all(assetId)) {
      if (Object.prototype.hasOwnProperty.call(out, r.result)) out[r.result] = r.n;
    }
    return out;
  }

` + anchor;
  s = s.slice(0, s.indexOf(anchor)) + add + s.slice(s.indexOf(anchor));
  changed = true; console.log("assetUseCounts added");
}

if (changed) { fs.writeFileSync(cp, s); console.log("core written"); }
else console.log("no changes");
