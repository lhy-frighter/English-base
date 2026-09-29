const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(p, "utf8");
const oldStr = `      // TEACH 尾块：挂教学面板（草稿，不自动成卡）
      if (split.teach) setTeachMap((prev) => ({ ...prev, [asstKey]: split.teach }));`;
const newStr = `      // TEACH 尾块：挂教学面板（草稿，不自动成卡）
      const teachNow = split.teach;
      if (teachNow) setTeachMap((prev) => ({ ...prev, [asstKey]: teachNow }));`;
const i = s.indexOf(oldStr);
if (i < 0) throw new Error("not found");
s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
fs.writeFileSync(p, s);
console.log("teach capture fixed");
