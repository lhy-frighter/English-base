const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(cp, "utf8");
if (s.indexOf("sentenceOf(rawText") !== -1) { console.log("already"); process.exit(0); }

const oldHead = `  textDebriefCandidates(textId) {
    const rows = this.user.prepare(\`SELECT DISTINCT word FROM lookup_log
      WHERE text_id=? ORDER BY id DESC\`).all(textId);
    const out = [];
    const seen = new Set();`;
const newHead = `  textDebriefCandidates(textId) {
    const rows = this.user.prepare(\`SELECT DISTINCT word FROM lookup_log
      WHERE text_id=? ORDER BY id DESC\`).all(textId);
    const trow = this.user.prepare("SELECT raw_text FROM texts WHERE id=?").get(textId);
    const rawText = trow && trow.raw_text ? trow.raw_text : "";
    const sentenceOf = (word) => {
      if (!rawText) return "";
      const sents = rawText.split(/(?<=[.!?])\\s+/);
      const esc = String(word).replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
      let re;
      try { re = new RegExp("\\\\b" + esc + "\\\\b", "i"); } catch { return ""; }
      const hit = sents.find((sx) => re.test(sx));
      return hit ? hit.replace(/\\s+/g, " ").trim() : "";
    };
    const out = [];
    const seen = new Set();`;
if (s.indexOf(oldHead) === -1) throw new Error("head anchor missing");
s = s.replace(oldHead, newHead);

const oldPush = `      const gloss = drow ? String(drow.translation).split("\\n")[0].trim() : "";
      out.push({ kind: 'word', canonical: base, clicked: w, gloss });`;
const newPush = `      const gloss = drow ? String(drow.translation).split("\\n")[0].trim() : "";
      out.push({ kind: 'word', canonical: base, clicked: w, gloss, sentence: sentenceOf(w) });`;
if (s.indexOf(oldPush) === -1) throw new Error("push anchor missing");
s = s.replace(oldPush, newPush);

fs.writeFileSync(cp, s);
console.log("patched");
