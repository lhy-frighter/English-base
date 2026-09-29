const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}
R(
  `                      ) : (
                        <div className="back-word">
                          <b className="hw">{card.word}</b>
                          {card.phonetic && <span className="phon">/{card.phonetic}/</span>}
                        </div>`,
  `                      ) : (
                        <>
                        <div className="back-word">
                          <b className="hw">{card.word}</b>
                          {card.phonetic && <span className="phon">/{card.phonetic}/</span>}
                        </div>`,
  "frag open"
);
R(
  `                      )}
                    </div>
                    <div className="ratings">`,
  `                      </>
                      )}
                    </div>
                    <div className="ratings">`,
  "frag close"
);
fs.writeFileSync(p, s);
console.log("word fragment restored");
