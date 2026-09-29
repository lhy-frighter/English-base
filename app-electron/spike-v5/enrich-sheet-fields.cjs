const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/components/AssetCaptureSheet.tsx";
let s = fs.readFileSync(p, "utf8");
function sliceRep(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// 1) 状态
sliceRep(
  `  const [testPoint, setTestPoint] = useState("");`,
  `  const [testPoint, setTestPoint] = useState("");
  const [grammarAnswer, setGrammarAnswer] = useState("");
  const [ipa, setIpa] = useState("");`,
  "state"
);
// 2) 重置
sliceRep(
  `    setTestPoint("");`,
  `    setTestPoint("");
    setGrammarAnswer("");
    setIpa("");`,
  "reset"
);
// 3) payload
sliceRep(
  `          payload = { exercise_form: exerciseForm, prompt: canon, explanation: gloss };`,
  `          payload = { exercise_form: exerciseForm, prompt: canon, answer: grammarAnswer, explanation: gloss };`,
  "grammar payload"
);
sliceRep(
  `          payload = { problem_type: problemType, perception: true };`,
  `          payload = { problem_type: problemType, ipa, perception: true };`,
  "pron payload"
);
// 4) grammar 答案输入（插在 grammar 练习形式 label 之后）
sliceRep(
  `        {kind === "pronunciation" && (
          <label className="cap-field cap-inline">
            <span>问题类型</span>`,
  `        {kind === "grammar" && (
          <label className="cap-field">
            <span>正确答案</span>
            <input value={grammarAnswer} onChange={(e) => setGrammarAnswer(e.target.value)} />
          </label>
        )}
        {kind === "pronunciation" && (
          <label className="cap-field cap-inline">
            <span>问题类型</span>`,
  "grammar answer ui"
);
// 5) pronunciation IPA（插在问题类型 label 块结束之后、preview 之前）
sliceRep(
  `        <div className="cap-preview">`,
  `        {kind === "pronunciation" && (
          <label className="cap-field cap-inline">
            <span>IPA</span>
            <input value={ipa} onChange={(e) => setIpa(e.target.value)} placeholder="可稍后再补" />
          </label>
        )}
        <div className="cap-preview">`,
  "ipa ui"
);
fs.writeFileSync(p, s);
console.log("sheet enriched");
