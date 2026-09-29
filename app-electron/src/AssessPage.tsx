import { useEffect, useMemo, useRef, useState } from "react";
import { api, type AssessmentBlueprint, type AssessmentResult, type AssessmentStart } from "./api";
import { translator } from "./translate/translate";

type Stage = "select" | "read" | "quiz" | "result";

// 段落按词切分（保留标点为独立片段）
function splitTokens(para: string): { w: string; isWord: boolean }[] {
  const out: { w: string; isWord: boolean }[] = [];
  const re = /[A-Za-z0-9''-]+/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(para))) {
    if (m.index > last) out.push({ w: para.slice(last, m.index), isWord: false });
    out.push({ w: m[0], isWord: true });
    last = m.index + m[0].length;
  }
  if (last < para.length) out.push({ w: para.slice(last), isWord: false });
  return out;
}

export default function AssessPage(props: { onExit: () => void; onDone?: () => void }) {
  const [stage, setStage] = useState<Stage>("select");
  const [bps, setBps] = useState<AssessmentBlueprint[]>([]);
  const [start, setStart] = useState<AssessmentStart | null>(null);
  const [body, setBody] = useState<string>("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // 阅读期指标
  const activeMsRef = useRef(0);
  const [, forceTick] = useState(0);
  const lookedRef = useRef<Set<string>>(new Set());
  const transRef = useRef<Set<number>>(new Set());
  const [pop, setPop] = useState<{ word: string; text: string } | null>(null);
  const [zhParas, setZhParas] = useState<Record<number, string>>({});

  // 答题
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<AssessmentResult | null>(null);

  useEffect(() => {
    api.assessmentBlueprints().then(setBps).catch((e) => setErr(String(e)));
  }, []);

  // 活跃计时（仅阅读阶段、页面可见时累计）
  useEffect(() => {
    if (stage !== "read") return;
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") activeMsRef.current += 1000;
      forceTick((x) => x + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, [stage]);

  const paras = useMemo(() => body.split(/\n+/).map((p) => p.trim()).filter(Boolean), [body]);

  async function begin(bpId: string) {
    setErr(""); setBusy(true);
    try {
      const s = await api.assessmentStart(bpId);
      const b = await api.getBuiltin(s.builtin_id);
      if (!b) throw new Error("测评原文加载失败");
      setStart(s); setBody(b.text);
      activeMsRef.current = 0; lookedRef.current = new Set(); transRef.current = new Set();
      setZhParas({}); setPop(null); setAnswers(s.questions.map(() => -1));
      setStage("read");
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  async function clickWord(word: string) {
    const low = word.toLowerCase();
    if (!lookedRef.current.has(low)) lookedRef.current.add(low);
    try {
      const r = await api.lookup(low, "word", null, null);
      const text = r ? (r.translation ? r.translation.split("\\n")[0] : r.definition || "(无释义)") : "(无释义)";
      setPop({ word, text });
    } catch { setPop({ word, text: "(查询失败)" }); }
  }

  async function translatePara(i: number) {
    if (!start) return;
    if (!transRef.current.has(i)) transRef.current.add(i);
    setBusy(true); setErr("");
    try {
      const r = await translator.translate([paras[i]], false);
      setZhParas((z) => ({ ...z, [i]: r.zh[0] || "(翻译失败)" }));
    } catch (e) {
      transRef.current.delete(i);
      setErr("机翻不可用（需先在语音模型管理中安装翻译模型）：" + String(e));
    } finally { setBusy(false); }
  }

  async function submit() {
    if (!start) return;
    setBusy(true); setErr("");
    try {
      const r = await api.assessmentFinish({
        formId: start.form_id,
        activeMs: activeMsRef.current,
        lookups: lookedRef.current.size,
        translatedParas: transRef.current.size,
        answers,
      });
      setResult(r); setStage("result");
      props.onDone?.();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  const mins = Math.floor(activeMsRef.current / 60000);
  const secs = Math.floor((activeMsRef.current % 60000) / 1000);

  return (
    <div className="page assess-page">
      <div className="page-head">
        <button className="btn ghost" onClick={props.onExit}>← 返回</button>
        <h2>能力测评</h2>
      </div>

      {err && <div className="errmsg">{err}</div>}

      {stage === "select" && (
        <div className="assess-select">
          <p className="muted">
            每次使用一篇<strong>没读过的同级文本</strong>，在不提前准备的情况下完成阅读和理解题。
            综合「理解题正确率、词汇覆盖率、阅读速度、对查词/翻译的依赖」给出独立理解得分。
            每篇文本只会出现一次，避免背题刷分。
          </p>
          <div className="assess-bp-grid">
            {bps.map((bp) => (
              <div key={bp.id} className="card assess-bp">
                <div className="assess-bp-name">{bp.name}</div>
                <div className="muted small">剩余测评卷 {bp.forms_left}/{bp.forms_total} · 参考速度 {bp.recWpm} 词/分</div>
                <button className="btn primary" disabled={busy || bp.forms_left === 0} onClick={() => begin(bp.id)}>
                  {bp.forms_left === 0 ? "已用完" : "开始测评"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {stage === "read" && start && (
        <div className="assess-read">
          <div className="assess-bar">
            <div className="assess-title">{start.title} <span className="badge">{start.cefr}</span></div>
            <div className="muted small">
              计时 {mins}:{String(secs).padStart(2, "0")} · 查词 {lookedRef.current.size} · 机翻 {transRef.current.size} 段
            </div>
            <button className="btn primary" disabled={busy} onClick={() => setStage("quiz")}>我读完了，去答题</button>
          </div>
          <div className="assess-text" onClick={() => setPop(null)}>
            {paras.map((p, i) => (
              <p key={i} className="assess-para">
                {splitTokens(p).map((t, j) => t.isWord
                  ? <span key={j} className="aw" onClick={(e) => { e.stopPropagation(); void clickWord(t.w); }}>{t.w}</span>
                  : <span key={j}>{t.w}</span>)}
                <button key={"b" + i} className="btn tiny ghost" onClick={(e) => { e.stopPropagation(); void translatePara(i); }}>
                  {zhParas[i] ? "已翻译" : "翻译本段"}
                </button>
                {zhParas[i] && <span className="assess-zh">{zhParas[i]}</span>}
              </p>
            ))}
          </div>
          {pop && (
            <div className="assess-pop" onClick={(e) => e.stopPropagation()}>
              <strong>{pop.word}</strong>
              <div>{pop.text}</div>
            </div>
          )}
        </div>
      )}

      {stage === "quiz" && start && (
        <div className="assess-quiz">
          <p className="muted small">不允许再返回原文，按你的理解作答。</p>
          {start.questions.map((q, i) => (
            <div key={i} className="card assess-q">
              <div className="assess-q-text">{i + 1}. {q.q}</div>
              {q.options.map((o, j) => (
                <label key={j} className={"assess-opt" + (answers[i] === j ? " picked" : "")}>
                  <input type="radio" name={"q" + i} checked={answers[i] === j} onChange={() =>
                    setAnswers((a) => a.map((x, k) => (k === i ? j : x)))} />
                  {o}
                </label>
              ))}
            </div>
          ))}
          <div className="assess-actions">
            <button className="btn ghost" onClick={() => setStage("read")}>回去再看看</button>
            <button className="btn primary" disabled={busy || answers.some((a) => a < 0)} onClick={() => void submit()}>
              提交测评
            </button>
          </div>
        </div>
      )}

      {stage === "result" && result && (
        <div className="assess-result">
          <div className="assess-score-big">{result.score}<span className="assess-score-unit"> 分</span></div>
          <div className="muted">陌生同级材料独立理解得分</div>
          <div className="assess-break">
            <div className="card assess-break-item"><div className="num">{result.comp}</div><div className="muted small">理解题 {result.correct}/{result.questions}</div></div>
            <div className="card assess-break-item"><div className="num">{result.coverage}</div><div className="muted small">词汇覆盖</div></div>
            <div className="card assess-break-item"><div className="num">{result.speed}</div><div className="muted small">速度 {result.wpm} 词/分</div></div>
            <div className="card assess-break-item"><div className="num">{result.dependence}</div><div className="muted small">少依赖翻译</div></div>
          </div>
          <p className="muted small">
            权重：理解题 45% · 覆盖率 25% · 速度 15% · 少依赖 15%。
            建议在同一等级下每 1–2 周测一次，同级文本得分持续上升才代表能力提升。
          </p>
          <button className="btn primary" onClick={props.onExit}>完成</button>
        </div>
      )}
    </div>
  );
}
