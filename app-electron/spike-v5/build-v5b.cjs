const fs = require("fs");
const fp = "D:/vibe coding/英语学习/app-electron/spike-v5/audit-related-v5.txt";
let s = fs.readFileSync(fp, "utf8");
// head 取第一行最长中文义项段（≥2），并列取最早
s = s.replace(
  `      const hm = first.match(/[一-鿿]{2,6}/);
      const rank = row.frq > 0 ? Number(row.frq) : 0;
      if (hm) {`,
  `      const runs = (first.match(/[一-鿿]{2,6}/g) || []);
      let headRun = "";
      for (const rr of runs) { if (rr.length > headRun.length) headRun = rr; if (headRun.length >= 6) break; }
      const rank = row.frq > 0 ? Number(row.frq) : 0;
      if (headRun) {`
);
s = s.replace(`"%" + hm[0] + "%"`, `"%" + headRun + "%"`);
s = s.replace(
  `            const segs = s.firstLine.replace(/^\\s*[a-z]{1,6}\\./i, "").split(/[，,、；;]/).map((x) => x.trim()).filter(Boolean);
            return segs.some((seg) => seg === hm[0] || (seg.length <= hm[0].length + 1 && seg.includes(hm[0])));`,
  `            const segs = s.firstLine.replace(/^\\s*[a-z]{1,6}\\./i, "").split(/[，,、；;]/).map((x) => x.trim()).filter(Boolean);
            return segs.some((seg) => seg === headRun || (headRun.length >= 4 && seg.length <= headRun.length + 1 && seg.includes(headRun)));`
);
fs.writeFileSync(fp, s, "utf8");
console.log("v5 refined");
