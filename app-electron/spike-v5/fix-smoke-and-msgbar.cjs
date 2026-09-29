const fs = require("node:fs");

// 1) main.cjs：not-ok 分支 return，防止继续执行
const mp = "D:/vibe coding/英语学习/app-electron/main.cjs";
let m = fs.readFileSync(mp, "utf8");
const old1 = `          console.log("CLOUD_SMOKE body", await resp.text().catch(() => ""));
          app.exit(2);
        }`;
const new1 = `          console.log("CLOUD_SMOKE body", await resp.text().catch(() => ""));
          app.exit(2);
          return;
        }`;
if (!m.includes(old1)) throw new Error("smoke not-ok anchor missing");
m = m.replace(old1, new1);
fs.writeFileSync(mp, m);

// 2) ConversationPage：chat 视图显示 cloudMsg 错误条
const cp = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let c = fs.readFileSync(cp, "utf8");
const old2 = `      {micErr && <div className="conv-asr-bar"><em className="err-text">{micErr}</em></div>}
`;
const new2 = `      {micErr && <div className="conv-asr-bar"><em className="err-text">{micErr}</em></div>}
      {cloudMsg && <div className="conv-asr-bar"><em className="err-text">{cloudMsg}</em></div>}
`;
if (!c.includes(old2)) throw new Error("micErr bar anchor missing");
c = c.replace(old2, new2);
fs.writeFileSync(cp, c);
console.log("smoke return + chat cloudMsg bar added");
