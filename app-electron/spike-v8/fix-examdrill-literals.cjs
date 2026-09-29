const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(cp, "utf8");
function fix(old, neu, label) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  s = s.split(old).join(neu); console.log("fixed", label);
}
fix(
  "        const goal = `Help me master this CET-6 point: ${point}. \"\n" +
  "          + `Question context: ${examDrill.stem}`",
  "        const goal = `Help me master this CET-6 point: ${point}. `\n" +
  "          + `Question context: ${examDrill.stem}`",
  "goal");
fix(
  "          text: `Let us work on this point together. Here is the question: ${examDrill.stem} \"\n" +
  "            + (examDrill.answer ? `The correct answer is ${examDrill.answer}. ` : \"\")",
  "          text: `Let us work on this point together. Here is the question: ${examDrill.stem} `\n" +
  "            + (examDrill.answer ? `The correct answer is ${examDrill.answer}. ` : \"\")",
  "guide");
fs.writeFileSync(cp, s);
console.log("written");
