const fs = require("fs");
const fp = "D:/vibe coding/英语学习/app-electron/spike-v5/audit-related-v4.txt";
let s = fs.readFileSync(fp, "utf8");
s = s.replace(
  `"SELECT word,pos,translation FROM dict.words WHERE word LIKE ? AND word<>? AND length(word)<=length(?)+8 ORDER BY frq DESC LIMIT 120")`,
  `"SELECT word,pos,translation,frq,tag FROM dict.words WHERE word LIKE ? AND word<>? AND length(word)<=length(?)+8 ORDER BY frq DESC LIMIT 120")`
);
s = s.replace(
  `if (w.includes("-") || !accept.has(w)) continue;`,
  `if (w.includes("-") || !accept.has(w) || !(Number(r.frq) > 0 || (r.tag || ""))) continue;`
);
// 近义词：JS 端按义项段精确匹配（head 必须是某个短义项段，而非长释义里的子串）
const oldFilter = `        synonyms = this.user.prepare(q).all(...args)
          .map((r2) => ({
            word: r2.word,
            gloss: (r2.translation.split("\\\\n")[0] || "").replace(/\\[[^\\]]*\\]/g, "").slice(0, 36),
          }))
          .filter((s) => {
            if (!s.gloss || s.word.includes("-") || samePrefix(s.word.toLowerCase())) return false;
            const neg = /[不没无非反]/.test(s.gloss) && !/[不没无非反]/.test(first);
            return !neg;
          })
          .slice(0, 6);`;
const newFilter = `        synonyms = this.user.prepare(q).all(...args)
          .map((r2) => ({
            word: r2.word,
            gloss: (r2.translation.split("\\\\n")[0] || "").replace(/\\[[^\\]]*\\]/g, "").slice(0, 36),
            firstLine: r2.translation.split("\\\\n")[0] || "",
          }))
          .filter((s) => {
            if (!s.gloss || s.word.includes("-") || samePrefix(s.word.toLowerCase())) return false;
            const neg = /[不没无非反]/.test(s.gloss) && !/[不没无非反]/.test(first);
            if (neg) return false;
            // 义项段（逗号/顿号/分号切分）中必须有与 head 相等或仅差 1 字的段，拒绝“战争状态”式子串碰撞
            const segs = s.firstLine.replace(/^\\s*[a-z]{1,6}\\./i, "").split(/[，,、；;]/).map((x) => x.trim()).filter(Boolean);
            return segs.some((seg) => seg === hm[0] || (seg.length <= hm[0].length + 1 && seg.includes(hm[0])));
          })
          .map(({ word, gloss }) => ({ word, gloss }))
          .slice(0, 6);`;
if (!s.includes(oldFilter)) throw new Error("syn filter anchor missing");
s = s.replace(oldFilter, newFilter);
fs.writeFileSync(fp, s, "utf8");
console.log("v5 text ready");
