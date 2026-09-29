const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/TutorTeachPanel.tsx";
let s = fs.readFileSync(p, "utf8");
const oldStr = `      <div className="teach-sentence">
        <div className="teach-en">{teach.en}</div>
        <div className="teach-zh muted">{teach.zh}</div>
      </div>`;
const newStr = `      <div className="teach-sentence">
        <div className="teach-en">{teach.en}</div>
        <div className="teach-zh muted">{teach.zh}</div>
        <button
          type="button"
          className="teach-sentence-add"
          onClick={() => onPick(
            { kind: "chunk", canonical: teach.en, gloss: teach.zh, exampleZh: teach.zh },
            sentence,
          )}
        >
          整句加入复习
        </button>
      </div>`;
const i = s.indexOf(oldStr);
if (i < 0) throw new Error("not found");
s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
fs.writeFileSync(p, s);
console.log("sentence add button wired");
