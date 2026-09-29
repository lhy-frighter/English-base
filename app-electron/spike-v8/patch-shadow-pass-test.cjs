const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/debrief.cjs";
let s = fs.readFileSync(tp, "utf8");
if (s.indexOf("对话来源句跟读通过链") !== -1) { console.log("already"); process.exit(0); }
const anchor = `console.log(\`\\ndebrief: \${pass} passed, \${fail} failed\`);
process.exit(fail ? 1 : 0);`;
if (s.indexOf(anchor) === -1) throw new Error("anchor missing");
const add = `// 8.1 对话来源句跟读通过链（1/3/7 走完 → graduated，origin 保留）
const convSent = "Nice to meet you";
const sp1 = core.shadowPractice({
  sentence: convSent, originKind: "conversation", originRef: "turn-xyz", similarity: 90,
});
check("新句 stage0", sp1.isNew && sp1.stage === 0, JSON.stringify(sp1));
const advance8 = () => {
  const row = db.prepare("SELECT id FROM shadow_sentences WHERE sentence_hash=?").get(sp1.hash);
  db.prepare("UPDATE shadow_sentences SET due_at=? WHERE id=?").run(Date.now() - 1000, row.id);
  return core.shadowPractice({
    sentence: convSent, originKind: "conversation", originRef: "turn-xyz", similarity: 95,
  });
};
const a1 = advance8(); check("推进 stage1", a1.stage === 1 && a1.advanced);
const a2 = advance8(); check("推进 stage2", a2.stage === 2);
const a3 = advance8(); check("graduated", Boolean(a3.graduated) && a3.status === "graduated");
check("turn 通过查询", core.shadowPassedForTurn("turn-xyz") === true);
check("turn 未通过查询", core.shadowPassedForTurn("turn-missing") === false);
const flags8 = core.shadowPassedForSentences({
  sentences: [convSent, "an unrelated sentence"],
});
check("句通过查询", flags8[0] === true && flags8[1] === false, JSON.stringify(flags8));
throws("originKind 非法抛错", () =>
  core.shadowPractice({ sentence: convSent, originKind: "bad" }));

` + anchor;
s = s.replace(anchor, add);
fs.writeFileSync(tp, s);
console.log("patched");
