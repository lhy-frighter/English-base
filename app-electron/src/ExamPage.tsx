import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type PaperListItem, type PaperDetail, type GradeResult, type WrongItem, type PaperCue,
  type ExamWeakItem, type PaperQuestion,
} from "./api";
import { cueSend } from "./shadow/send";
import { AssetCaptureSheet } from "./components/AssetCaptureSheet";
import { confirmDialog, EmptyState, RingGauge, Seg } from "./components/ui";
import { Icon } from "./icons";
import { ProcCover } from "./ProcCover";
import { GrammarDiagnosisPanel } from "./components/GrammarDiagnosisPanel";
import { analyzeGrammar } from "./conversation/grammar-engine";
import type { GrammarAnalysis } from "./conversation/grammar-engine";

// 原创样卷（无版权，用于体验试卷格式与流程）
const SAMPLE_MD = `# 原创六级阅读样卷（本地练习题）
::meta kind=cet6
## Reading · Passage 1
The city introduced a new repair ordinance. Consumers gained the right to fix their own
electronics, which had previously been blocked by manufacturer restrictions. Independent
repair shops welcomed the move, though some brands argued that safety standards required
authorized service. The debate reflects a wider question: who should own a product after it
is sold.

### Q1
The word "ordinance" is closest in meaning to ___.
- A) ceremony
- B) regulation
- C) product
- D) subsidy
> answer: B
> analysis: ordinance 意为法令、条例，与 regulation 近义；ceremony（仪式）为形近干扰。
> point: 词汇题 · 上下文词义

### Q2
Consumers had been unable to repair their own devices because ___.
- A) they lacked basic tools
- B) manufacturers restricted repair
- C) spare parts were exported
- D) devices were too cheap
> answer: B
> analysis: 首段 "had previously been blocked by manufacturer restrictions" 直接对应。
> point: 细节题 · 因果定位

### Q3
What is the author's main purpose in this passage?
- A) To criticize independent shops
- B) To present a policy debate over ownership
- C) To advertise authorized service
- D) To describe a city ceremony
> answer: B
> point: 主旨题

## Writing
::kind writing
### Q4
Directions: write a short paragraph (80 words) on whether consumers should have the right to repair their own electronics.
> model: In my view, consumers should have the right to repair what they own.
> Independent repair shops lower maintenance costs and reduce electronic waste, while
> authorized service is often expensive and slow. Safety concerns can be addressed by
> public manuals and certified parts rather than by locking users out.
`;

const REASONS = ["词汇", "句法", "题型技巧", "辨音", "粗心"];
const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const fmtT = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// 听力播放器：逐句字幕同步、点击跳转、变速、AB 区间复读
function ListeningPlayer({ audioName, cues, blind, onSendShadow }: { audioName: string; cues: PaperCue[]; blind: boolean; onSendShadow?: (t: string) => void }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const cueBoxRef = useRef<HTMLDivElement | null>(null);
  const [src, setSrc] = useState("");
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);

  useEffect(() => { let alive = true;
    if (audioName) api.mediaUrl(audioName).then((u) => { if (alive && u) setSrc(u); });
    return () => { alive = false; };
  }, [audioName]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => {
      const ct = el.currentTime;
      setT(ct);
      if (a != null && b != null && ct >= b) el.currentTime = a; // AB 复读
    };
    el.addEventListener("timeupdate", onTime);
    return () => el.removeEventListener("timeupdate", onTime);
  }, [a, b]);

  // 当前字幕：最后一个 t<=当前时间的 cue
  let curIdx = -1;
  cues.forEach((c, i) => { if (c.t <= t + 0.05) curIdx = i; });
  useEffect(() => {
    const box = cueBoxRef.current; if (!box) return;
    const el = box.querySelector<HTMLElement>(`.cue-on`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [curIdx]);

  const seek = (s: number) => { if (ref.current) { ref.current.currentTime = s; setT(s); } };
  const toggle = () => {
    const el = ref.current; if (!el) return;
    if (el.paused) { el.play(); setPlaying(true); } else { el.pause(); setPlaying(false); }
  };
  const markAB = () => {
    if (a == null || (a != null && b != null)) { setA(t); setB(null); }
    else setB(t);
  };
  if (!audioName) return (
    <div className="listen-bar no-audio">未找到音频文件（试卷用 ::audio 文件名.mp3 声明，导入时一并选择本地音频）；可先按字幕文本精听。</div>
  );
  return (
    <div className="listen-box">
      <audio ref={ref} src={src} preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)} />
      <div className="listen-ctrl">
        <button className="primary" onClick={toggle}>{playing ? "⏸ 暂停" : "▶ 播放"}</button>
        <span className="listen-clock">{fmtT(t)} / {fmtT(dur)}</span>
        <input type="range" min={0} max={dur || 0} step={0.1} value={t}
          onChange={(e) => seek(Number(e.target.value))} />
        <select value={rate} onChange={(e) => { const v = Number(e.target.value); setRate(v); if (ref.current) ref.current.playbackRate = v; }}>
          {[0.75, 1, 1.25, 1.5].map((v) => <option key={v} value={v}>{v}x</option>)}
        </select>
        <button className="ghost2" onClick={markAB} title="按一次定 A，再按定 B，区间循环；第三次清除">
          AB 复读{a == null ? "" : b == null ? ` A=${fmtT(a)}` : ` ${fmtT(a!)}-${fmtT(b!)}`}
        </button>
        {(a != null && b != null) && <button className="ghost" onClick={() => { setA(null); setB(null); }}>清除区间</button>}
      </div>
      {!blind && cues.length > 0 && (
        <div className="cue-box" ref={cueBoxRef}>
          {cues.map((c, i) => (
            <p key={i} className={"cue" + (i === curIdx ? " cue-on" : "")} onClick={() => seek(c.t)}>
              <span className="cue-t">{fmtT(c.t)}</span>{c.text}
              {onSendShadow && c.text.trim() && (
                <button className="cue-to-shadow" title="把这句送到跟读台"
                  onClick={(e) => cueSend(e, c.text, (t) => onSendShadow?.(t))}>跟读</button>
              )}
            </p>
          ))}
        </div>
      )}
      {blind && <p className="muted">盲听模式：字幕已隐藏（先听，听不懂再关闭盲听对照）。</p>}
    </div>
  );
}

export function ExamPage({ onCardsChanged, onSendShadow, onConversationDrill }: {
  onCardsChanged: () => void;
  onSendShadow?: (t: string) => void;
  onConversationDrill?: (item: ExamWeakItem) => void; }) {
  const [view, setView] = useState<"list" | "take" | "result" | "wrong">("list");
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [md, setMd] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [blind, setBlind] = useState(false); // 听力盲听拐杖档
  const [audioPaths, setAudioPaths] = useState<string[]>([]); // 导入时附带的本地音频
  const startedAtRef = useRef<number>(Date.now());
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<GradeResult | null>(null);

  const [wrong, setWrong] = useState<WrongItem[]>([]);
  const [wrongFilter, setWrongFilter] = useState<"active" | "archived" | "all">("active");
  const [capW, setCapW] = useState<WrongItem | null>(null);
  const [redoPick, setRedoPick] = useState<Record<number, string>>({});
  const [redoMsg, setRedoMsg] = useState<Record<number, string>>({});

  // S15-1 写作题云端深度批改（按题号）
  const [writingGrammar, setWritingGrammar] = useState<Record<string, GrammarAnalysis>>({});
  const [writingBusy, setWritingBusy] = useState<string | null>(null);
  const [writingMsg, setWritingMsg] = useState<Record<string, string>>({});

  // S15-1：写作主观题云端深度批改（再点一次收起）
  const openWritingGrammar = async (q: PaperQuestion, picked0: string) => {
    const key = String(q.index);
    if (writingGrammar[key]) {
      setWritingGrammar((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }
    const picked = picked0.trim();
    if (!picked) {
      setWritingMsg((prev) => ({ ...prev, [key]: "请先填写作答" }));
      return;
    }
    setWritingBusy(key);
    try {
      const r = await analyzeGrammar(picked, "Writing task prompt: " + q.stem);
      if (r.ok) {
        setWritingGrammar((prev) => ({ ...prev, [key]: r.analysis }));
      } else {
        const reason = r.reason;
        const txt = reason === "grammar_consent_off"
          ? "需先在对话页云端设置勾选「文本送云端做语法深度分析」"
          : reason === "cloud_key_missing"
            ? "请先在对话页云端设置保存 API Key"
            : reason === "bad_json" || reason.startsWith("schema_failed")
              ? "结构化分析失败，可重试"
              : "深度分析失败：" + reason;
        setWritingMsg((prev) => ({ ...prev, [key]: txt }));
      }
    } finally {
      setWritingBusy(null);
    }
  };

  const refreshPapers = useCallback(() => {
    api.listPapers().then(setPapers).catch((e) => setErr(String(e)));
  }, []);
  const refreshWrong = useCallback(() => {
    api.listWrong(wrongFilter).then(setWrong).catch((e) => setErr(String(e)));
  }, [wrongFilter]);

  useEffect(() => { refreshPapers(); }, [refreshPapers]);
  useEffect(() => { if (view === "wrong") refreshWrong(); }, [view, refreshWrong]);
  useEffect(() => {
    if (view !== "take") return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [view]);

  const doImport = async (text: string, label: string) => {
    setErr("");
    try {
      const r = await api.importPaper(text, audioPaths);
      setMsg(r.duplicated ? `「${r.title}」已存在（${r.nQuestions} 题），未重复导入`
        : `${label}「${r.title}」已导入（${r.nQuestions} 题${r.audio ? "，音频已入库" : ""}）`);
      setMd(""); setImportOpen(false); setAudioPaths([]); refreshPapers();
    } catch (e) { setErr(String(e)); }
  };

  const startPaper = async (id: number) => {
    setErr("");
    const p = await api.getPaper(id);
    if (!p) return;
    setPaper(p); setAnswers({}); setResult(null); setBlind(false);
    startedAtRef.current = Date.now(); setNow(Date.now());
    setView("take");
  };

  const submit = async () => {
    if (!paper) return;
    const unanswered = paper.struct.questions.filter((q) => {
      const v = answers[q.index];
      return v == null || !String(v).trim();
    }).length;
    if (unanswered > 0) {
      const ok = await confirmDialog({
        title: `还有 ${unanswered} 题未作答`, body: "确定要交卷吗？", okLabel: "交卷", cancelLabel: "继续作答",
      });
      if (!ok) return;
    }
    const r = await api.gradeAttempt(paper.id, answers, startedAtRef.current);
    setResult(r); setView("result"); refreshPapers();
  };

  const tagReason = async (w: WrongItem, reason: string) => {
    await api.setWrongReason(w.id, reason);
    onCardsChanged();
    setMsg(`已按「${reason}」生成概念卡，进入复习队列，到期自动提醒`);
    refreshWrong();
  };
  const redo = async (w: WrongItem) => {
    const picked = redoPick[w.id];
    if (!picked) { setErr("先选择你的答案再提交重做"); return; }
    const r = await api.redoWrong(w.id, picked);
    setRedoMsg((m) => ({ ...m, [w.id]: (r.correct ? "✓ " : "✗ ") + r.stage_label }));
    setRedoPick((m) => ({ ...m, [w.id]: "" }));
    refreshWrong();
  };
  const archive = async (id: number) => { await api.archiveWrong(id); refreshWrong(); };

  // ============ 试卷库 ============
  if (view === "list") return (
    <div className="page">
      <div className="page-head">
        <h2>考试 · 试卷库</h2>
        <button className="primary" onClick={() => setImportOpen((v) => !v)}>导入试卷（Markdown）</button>
        <button className="ghost2" onClick={() => doImport(SAMPLE_MD, "样卷")}>载入原创样卷</button>
        <button className="ghost2" onClick={() => setView("wrong")}>错题本</button>
      </div>
      {msg && <p className="ok-line">{msg}</p>}
      {err && <p className="err-line">{err}</p>}
      {importOpen && (
        <div className="paper-import">
          <p className="muted">
            格式：# 标题 → ## 篇章 → ### Q1 起题，选项「- A) …」，答案「&gt; answer: B」，
            另可附 &gt; analysis / &gt; point。发行版不内置版权真题，请自行导入。
          </p>
          <textarea className="paper-ta" value={md} onChange={(e) => setMd(e.target.value)}
            placeholder="把试卷 Markdown 粘贴到这里……" />
          <div>
            <label className="ghost2 file-btn">
              从 .md 文件读取
              <input type="file" accept=".md,.txt,text/markdown,text/plain" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                setMd(await f.text());
              }} />
            </label>
            <label className="ghost2 file-btn">
              {audioPaths.length ? `已选音频 ${audioPaths.length} 个` : "附听力音频（可选，可多选）"}
              <input type="file" accept="audio/*,.mp3,.m4a,.wav" multiple hidden onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setAudioPaths(files.map(api.pathForFile).filter(Boolean));
              }} />
            </label>
            <button className="primary" disabled={!md.trim()} onClick={() => doImport(md, "已导入")}>解析入库</button>
          </div>
        </div>
      )}
      {papers.length === 0 ? (
        <EmptyState
          seed="exam-empty"
          text="还没有试卷。可先「载入原创样卷」体验完整链路：做题 → 交卷判分 → 错题回炉。发行版不内置版权真题。"
          action={<button className="btn-primary" onClick={() => doImport(SAMPLE_MD, "样卷")}>载入原创样卷</button>}
        />
      ) : (
        <div className="paper-grid">
          {papers.map((p) => (
            <div key={p.id} className="paper-card">
              <ProcCover seed={"paper-" + p.id} />
              <div className="pc-body">
                <b className="pc-title">{p.title}</b>
                <div className="pc-badges">
                  <span className="sec-tag">{p.n_questions} 题</span>
                  <span className="sec-tag">{p.kind}</span>
                  {p.active_wrong > 0 && <span className="fit-badge fit-hard">待清错题 {p.active_wrong}</span>}
                </div>
                <p className="muted pc-meta">
                  {p.last_attempt ? `最近作答 ${new Date(p.last_attempt).toLocaleDateString("zh-CN")}` : "尚未作答"}
                </p>
                <button className="btn-primary pc-go" onClick={() => startPaper(p.id)}>开始做题</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ============ 做题 ============
  if (view === "take" && paper) {
    const qs = paper.struct.questions;
    return (
      <div className="page">
        <div className="page-head">
          <button className="ghost2" onClick={async () => {
            const ok = await confirmDialog({ title: "退出本次做题？", body: "本次作答不会保存。", danger: true, okLabel: "退出", cancelLabel: "继续作答" });
            if (ok) setView("list");
          }}>← 试卷库</button>
          <h2>{paper.title}</h2>
          {paper.struct.sections.some((s) => s.kind === "listening") && (
            <button className={blind ? "primary" : "ghost2"} onClick={() => setBlind((v) => !v)} title="拐杖档：先盲听，再开字幕对照">
              盲听字幕：{blind ? "已隐藏" : "显示"}
            </button>
          )}
          <span className="exam-timer glass-dark"><Icon name="Clock" size={13} /> {fmtClock(now - startedAtRef.current)}</span>
          <button className="primary" onClick={submit}>交卷判分</button>
        </div>
        <div className="exam-body">
          <div>
            {paper.struct.sections.map((s, si) => (
              <section key={si} className="exam-section">
                <h3>{s.title}{s.kind === "listening" && <span className="sec-tag">听力</span>}{s.kind === "writing" && <span className="sec-tag">写作/翻译</span>}</h3>
                {s.kind === "listening" && (
                  <ListeningPlayer audioName={s.audio || paper.audio} cues={s.cues} blind={blind} onSendShadow={onSendShadow} />
                )}
                {s.passage && s.kind !== "listening" && <div className="exam-passage">{s.passage}</div>}
                {s.kind === "listening" && !blind && s.passage && !s.cues.length && (
                  <div className="exam-passage">{s.passage}</div>
                )}
                {s.questions.map((q) => (
                  <div key={q.index} id={`q-${q.index}`} className={"exam-q" + (answers[q.index]?.trim() ? " answered" : "")}>
                    <p className="q-stem"><b>{q.index + 1}.</b> {q.stem}</p>
                    {q.qtype === "objective" ? (
                      <div className="q-opts">
                        {q.options.map((o) => (
                          <button key={o.key}
                            className={"q-opt" + (answers[q.index] === o.key ? " picked" : "")}
                            onClick={() => setAnswers((a) => ({ ...a, [q.index]: o.key }))}>
                            <b>{o.key}.</b> {o.text}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <textarea className="write-ta" value={answers[q.index] || ""}
                        placeholder="在此作答（离线留存，交卷后与范文对照；自动评分留待 Agent 期）……"
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.index]: e.target.value }))} />
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
          <aside className="exam-sheet">
            <h4>答题卡</h4>
            <div className="sheet-grid">
              {qs.map((q) => (
                <a key={q.index} href={`#q-${q.index}`}
                  className={"sheet-cell" + (answers[q.index]?.trim() ? " done" : "")}>
                  {q.index + 1}{q.qtype === "objective" && answers[q.index] ? `·${answers[q.index]}` : ""}
                </a>
              ))}
            </div>
            <p className="muted">已答 {qs.filter((q) => answers[q.index]?.trim()).length} / {qs.length}</p>
          </aside>
        </div>
      </div>
    );
  }

  // ============ 判分报告 ============
  if (view === "result" && paper && result) {
    const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
    const subj = result.details.filter((d) => !d.graded);
    return (
      <div className="page">
        <div className="page-head">
          <h2>判分报告</h2>
          <button className="ghost2" onClick={() => setView("list")}>回试卷库</button>
          <button className="primary" onClick={() => setView("wrong")}>去错题本（{result.total - result.correct} 题新入）</button>
          <button className="ghost2" onClick={() => startPaper(paper.id)}>再做一次</button>
        </div>
        <div className="result-hero exam-result-head">
          <RingGauge pct={pct} label="客观题正确率" />
          <div className="rh-info">
            <b className="rh-score">客观题 {result.correct} / {result.total}</b>
            <p className="muted">
              {subj.length > 0 ? `另有 ${subj.length} 道写作/翻译题已留存，见下方范文对照。` : ""}
              用时 {fmtClock(Date.now() - startedAtRef.current)}
            </p>
          </div>
        </div>
        {paper.struct.questions.map((q) => {
          const d = result.details.find((x) => x.index === q.index)!;
          if (!d.graded) {
            return (
              <div key={q.index} className="result-q subj">
                <p className="q-stem"><b>{q.index + 1}. 写作/翻译</b> {q.stem}</p>
                <p className="write-mine"><span className="lbl">你的作答</span>{d.picked.trim() || "（未作答）"}</p>
                {d.model && <p className="write-model"><span className="lbl">参考范文</span>{d.model}</p>}
                <div className="write-cloud-row">
                  <button type="button" className="ghost2"
                    onClick={() => { void openWritingGrammar(q, d.picked); }}>
                    {writingBusy === String(q.index) ? "分析中…" : "☁️ 云端深度批改"}
                  </button>
                  {writingMsg[q.index] && <em className="err-text">{writingMsg[q.index]}</em>}
                </div>
                {writingGrammar[q.index] && (
                  <GrammarDiagnosisPanel
                    source={{ originKind: "exam", originRef: `${paper.id}:${q.index}`, title: paper.title }}
                    text={d.picked.trim()}
                    analysis={writingGrammar[q.index]}
                    onClose={() => setWritingGrammar((prev) => {
                      const n = { ...prev }; delete n[String(q.index)]; return n;
                    })}
                  />
                )}
              </div>
            );
          }
          return (
            <div key={q.index} className={"result-q " + (d.correct ? "ok" : "bad")}>
              <p className="q-stem"><b>{q.index + 1}. {d.correct ? "✓" : "✗"}</b> {q.stem}</p>
              <p className="muted">你的选择：{d.picked || "未答"} · 正确答案：{q.answer}</p>
              {!d.correct && q.analysis && <p className="q-analysis"><span className="lbl">解析</span>{q.analysis}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  // ============ 错题本 ============
  return (
    <div className="page">
      <div className="page-head">
        <h2>错题本</h2>
        <Seg
          ariaLabel="错题筛选"
          value={wrongFilter}
          onChange={setWrongFilter}
          options={[{ value: "active", label: "待清" }, { value: "archived", label: "已归档" }, { value: "all", label: "全部" }]}
        />
        <button className="ghost2" onClick={() => setView("list")}>回试卷库</button>
      </div>
      {msg && <p className="ok-line">{msg}</p>}
      {err && <p className="err-line">{err}</p>}
      {wrong.length === 0 ? (
        <EmptyState seed="wrong-empty" text="没有错题。交卷后答错的客观题会自动进入这里，按 1/3/7 天阶段重做。"
          action={<button className="btn-primary" onClick={() => setView("list")}>回试卷库</button>} />
      ) : wrong.map((w) => (
        <div key={w.id} className={"wrong-card" + (w.due ? " due" : "") + (w.state === "archived" ? " archived" : "")}>
          <div className="wrong-head">
            <span className="li-title">{w.paper_title} · 第 {w.q_index + 1} 题</span>
            {w.due && <span className="fit-badge fit-stretch">今日到重做期</span>}
            <span className="muted">已重做 {w.redos} 次</span>
          </div>
          <div className="step-track wrong-stage" title={`重做阶段 ${w.stage + 1}/3（${w.stage_label}）`}>
            <span className="st-label">阶段 {w.stage + 1}/3</span>
            <span className="st-rail"><i className="st-fill" style={{ width: `${((w.stage + 1) / 3) * 100}%` }} /></span>
            <span className="muted">{w.stage_label}</span>
          </div>
          {w.question && <>
            <p className="q-stem">{w.question.stem}</p>
            <div className="q-opts compact">
              {w.question.options.map((o) => (
                <button key={o.key}
                  className={"q-opt" + (redoPick[w.id] === o.key ? " picked" : "") + (o.key === w.question!.answer ? " right-key" : "")}
                  disabled={w.state === "archived"}
                  onClick={() => setRedoPick((m) => ({ ...m, [w.id]: o.key }))}>
                  <b>{o.key}.</b> {o.text}
                </button>
              ))}
            </div>
            <div className="wrong-actions">
              {w.state === "active" && <>
                <button className="primary" onClick={() => redo(w)}>提交重做</button>
                <button className="ghost2" onClick={() => setCapW(w)}>转为练习</button>
                {String(w.question!.section_kind || "").toLowerCase().includes("listen") ? (
                  <button className="ghost2"
                    onClick={() => onSendShadow?.(w.question!.stem)}><Icon name="Voice" size={14} /> 送跟读台精听</button>
                ) : (
                  <button className="ghost2"
                    onClick={() => onConversationDrill?.({
                      id: w.id, paper_id: w.paper_id, q_index: w.q_index,
                      paper_title: w.paper_title, reason: w.reason,
                      stem: w.question!.stem,
                      section_kind: w.question!.section_kind || "",
                      answer: w.question!.answer || "",
                      point: w.question!.point || "",
                      is_listening: false,
                    })}><Icon name="Chat" size={14} /> 对话演练</button>
                )}
                <span className="muted">标错因并生成概念卡：</span>
                {REASONS.map((r) => (
                  <button key={r} className={"ghost2" + (w.reason === r ? " reason-on" : "")} onClick={() => tagReason(w, r)}>{r}</button>
                ))}
                <button className="ghost" onClick={() => archive(w.id)}>直接归档</button>
              </>}
              {w.concept_card_id && <span className="muted">概念卡已在复习队列</span>}
              {redoMsg[w.id] && <em className={redoMsg[w.id].startsWith("✓") ? "ok-line" : "err-line"}>{redoMsg[w.id]}</em>}
            </div>
            {w.question.analysis && <p className="q-analysis"><span className="lbl">解析</span>{w.question.analysis}</p>}
          </>}
        </div>
      ))}
      <AssetCaptureSheet open={capW !== null}
        source={capW ? {
          originKind: "exam",
          originRef: "paper-" + capW.paper_id + "-q-" + capW.q_index,
          title: capW.paper_title,
          sentence: capW.question?.stem ?? "",
        } : null}
        initialText={capW?.question?.stem ?? ""}
        onClose={() => setCapW(null)}
        onWord={(word: string, sent: string) => api.createShadowNote({ word, sentence: sent })}
        onDone={() => setCapW(null)} />
    </div>
  );
}
