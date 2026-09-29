const fs = require("fs");
const fp = "src/DashPage.tsx";
let s = fs.readFileSync(fp, "utf8");
if (s.includes("assessHist")) { console.log("already"); process.exit(0); }

// 1) 组件签名 + 状态
{
  const anchor = `export function DashPage() {
  const [range, setRange] = useState<number>(30);`;
  if (!s.includes(anchor)) throw new Error("sig anchor missing");
  s = s.replace(anchor, `export function DashPage(props: { onAssess?: () => void }) {
  const [range, setRange] = useState<number>(30);
  const [assessHist, setAssessHist] = useState<import("./api").AssessmentHistoryItem[]>([]);`);
}
// 2) 拉取历史
{
  const anchor = `  useEffect(() => { api.dashboard().then(setDash).catch(() => {}); }, []);`;
  if (!s.includes(anchor)) throw new Error("effect anchor missing");
  s = s.replace(anchor, anchor + `
  const loadAssess = () => api.assessmentHistory(10).then(setAssessHist).catch(() => {});
  useEffect(() => { void loadAssess(); }, []);`);
}
// 3) 能力区插入测评卡
{
  const anchor = `        <section className="d2-section">
          <div className="d2-sec-head"><h3>能力趋势</h3></div>
          <AbilitySection ins={ins} />
        </section>`;
  if (!s.includes(anchor)) throw new Error("ability anchor missing");
  const card = `        <section className="d2-section">
          <div className="d2-sec-head"><h3>能力趋势</h3></div>
          <div className="dcard wide assess-dash-card">
            <div className="assess-dash-head">
              <h3 style={{ margin: 0 }}>陌生同级材料独立理解得分</h3>
              <button className="btn primary" onClick={() => props.onAssess?.()}>开始能力测评</button>
            </div>
            {assessHist.length ? (
              <div className="assess-dash-list">
                {assessHist.map((h, i) => (
                  <div key={i} className="assess-dash-row" title={\`理解 \${h.comp} · 覆盖 \${h.coverage} · 速度 \${h.speed} · 少依赖 \${h.dependence}\`}>
                    <span className="badge">{h.cefr}</span>
                    <b>{h.score} 分</b>
                    <span className="muted small">{new Date(h.created_at).toLocaleDateString()} · {h.wpm} 词/分 · 对 {h.correct}/{h.questions}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">还没有测评记录。测评使用你没读过的同级文本，综合理解题、覆盖率、速度和对翻译的依赖打分；每篇只用一次，避免背题。</p>
            )}
          </div>
          <AbilitySection ins={ins} />
        </section>`;
  s = s.replace(anchor, card);
}
fs.writeFileSync(fp, s, "utf8");
console.log("DashPage wired");
