const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(p, "utf8");
const oldStr = `                  onDismiss={() => setTeachMap((prev) => {
                    const n = { ...prev }; delete n[t.turnKey]; return n;
                  })}`;
const newStr = `                  onDismiss={() => setTeachMap((prev) => {
                    const n: Record<string, TeachPayload> = {};
                    for (const k of Object.keys(prev)) if (k !== t.turnKey) n[k] = prev[k];
                    return n;
                  })}`;
const i = s.indexOf(oldStr);
if (i < 0) throw new Error("not found");
s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
fs.writeFileSync(p, s);
console.log("dismiss type fixed");
