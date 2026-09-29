const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/test/conv-session.cjs";
let s = fs.readFileSync(p, "utf8");

const anchor = `check("beginSession 非法 unit 归一为空", lsBadUnit.unit === "");
`;
if (!s.includes(anchor)) throw new Error("test anchor missing");
const add = `
// —— 6. convRecover 崩溃恢复 ——
const recSess = core.convCreate({ goal: "recover me", cefr: "B1" });
const genKey = \`turn:\${crypto.randomUUID()}\`;
const spkKey = \`turn:\${crypto.randomUUID()}\`;
core.convAddTurn({ sessionKey: recSess.sessionKey, turnKey: genKey, role: "assistant", text: "", status: "generating" });
core.convAddTurn({ sessionKey: recSess.sessionKey, turnKey: spkKey, role: "assistant", text: "Full sentence.", status: "speaking", committedText: "Full" });
const r = core.convRecover();
check("convRecover 处理两条未完成轮次", r.recovered === 2);
const after = core.convGet({ sessionKey: recSess.sessionKey });
const genTurn = after.turns.find((t) => t.turnKey === genKey);
const spkTurn = after.turns.find((t) => t.turnKey === spkKey);
check("generating → failed / 稳定错误码", genTurn.status === "failed" && genTurn.errorCode === "interrupted_by_restart");
check("speaking → interrupted / 已播前缀保留", spkTurn.status === "interrupted" && spkTurn.committedText === "Full");
check("convRecover 二次运行零处理", core.convRecover().recovered === 0);
`;
s = s.replace(anchor, anchor + add);
fs.writeFileSync(p, s);
console.log("convRecover tests added");
