const fs = require("fs");
const fp = "src/App.tsx";
let s = fs.readFileSync(fp, "utf8");
let n = 0;

// 1) import
if (!s.includes(`import AssessPage from "./AssessPage"`)) {
  const anchor = `import { DashPage } from "./DashPage";`;
  if (!s.includes(anchor)) throw new Error("import anchor missing");
  s = s.replace(anchor, anchor + `
import AssessPage from "./AssessPage";`);
  n++;
}
// 2) state（紧邻 recycleFrom）
if (!s.includes("assessView")) {
  const anchor = `  const [recycleFrom, setRecycleFrom] = useState<"today" | "lex">("today");`;
  if (!s.includes(anchor)) throw new Error("state anchor missing");
  s = s.replace(anchor, anchor + `
  const [assessView, setAssessView] = useState(false);`);
  n++;
}
// 3) 今日次级卡（放在每日好文卡之前）
if (!s.includes(`openAssess`)) {
  const anchor = `                    <button className="tcard" onClick={() => setTab("feed")}>
                      <b>每日好文</b>
                      <span>按当前水平推荐的新文章</span>
                    </button>`;
  if (!s.includes(anchor)) throw new Error("tcard anchor missing");
  s = s.replace(anchor, `                    <button className="tcard" onClick={() => setAssessView(true)}>
                      <b>能力测评</b>
                      <span>用没读过的同级文本测真实理解水平（建议每 1–2 周）</span>
                    </button>
` + anchor);
  n++;
}
// 4) DashPage 传 onAssess
if (s.includes(`{tab === "dash" && <DashPage />}`)) {
  s = s.replace(`{tab === "dash" && <DashPage />}`,
    `{tab === "dash" && <DashPage onAssess={() => setAssessView(true)} />}`);
  n++;
}
// 5) 渲染 AssessPage（覆盖式，放在 dash 渲染之后）
if (!s.includes(`{assessView && <AssessPage`)) {
  const anchor = `        {tab === "dash" && <DashPage onAssess={() => setAssessView(true)} />`;
  if (!s.includes(anchor)) throw new Error("dash render anchor missing");
  s = s.replace(anchor, anchor + `
        {assessView && <AssessPage onExit={() => setAssessView(false)} onDone={() => { void refreshToday(); }} />`);
  n++;
}
fs.writeFileSync(fp, s, "utf8");
console.log("App wired, edits:", n);
