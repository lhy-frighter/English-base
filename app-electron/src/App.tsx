import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Token, type Entry, type Annotated, type ReviewCard, type Counts, type BuiltIn, type LexemeInfo, type LexemeDetail, type LexSort, type Related, type SyllabusGroup, type SyllabusWord, type UrlPreview, type TextCard, type TextSourceKind, type TodayBrief, type RecycleItem, type DebriefDraft, type DebriefCandidate, type TextLearnedSummary, type PriorityDto, type ExamWeakItem } from "./api";
import { ExamPage } from "./ExamPage";
import VoicePage from "./VoicePage";
import VoiceCallPage from "./VoiceCallPage";
import ShadowPage from "./shadow/ShadowPage";
import { SessionTracker } from "./learning-session";
import FeedPage from "./FeedPage";
import { DashPage } from "./DashPage";
import AssessPage from "./AssessPage";
import ConversationPage, { type UsePrompt } from "./conversation/ConversationPage";
import { createNonce, sameParagraph, pickPairIndex, isChineseSelection } from "./shadow/send";
import { speak, speakWord, warmTts, ttsAvailable, onTtsStatus, prewarmKokoro, type TtsStatus } from "./tts";
import { AssetCaptureSheet } from "./components/AssetCaptureSheet";
import { DebriefPanel, type DebriefContext } from "./components/DebriefPanel";
import { GrammarDiagnosisPanel } from "./components/GrammarDiagnosisPanel";
import { UIHost, confirmDialog, EmptyState, ErrorState, Seg, toast, useAsync } from "./components/ui";
import { TranslateJudge } from "./components/TranslateJudge";
import { SettingsPanel } from "./components/SettingsPanel";
import { analyzeGrammar } from "./conversation/grammar-engine";
import type { GrammarAnalysis } from "./conversation/grammar-engine";
import { inference } from "./inference/coordinator";
import { translator } from "./translate/translate";
import { Icon } from "./icons";
import ErrorBoundary from "./ErrorBoundary";
import { ProcCover } from "./ProcCover";
import { LexGraph } from "./LexGraph";
import { HeroCanvas } from "./HeroCanvas";
import { useGlassPref } from "./glassPref";
import { Celebrate } from "./Celebrate";
import { paragraphsFromAnn, sha256Hex, normalizePairs, chunk as chunkArr } from "./translate/articleMt";

const SAMPLE = `The Fulton County Grand Jury said Friday an investigation of Atlanta's recent primary election produced no evidence that any irregularities took place. The jury further said in term-end presentments that the City Executive Committee, which had over-all charge of the election, deserves the praise and thanks of the Atlanta city government for the way the election was conducted. Reading English articles every day is the single most reliable way to grow vocabulary that actually sticks.`;

const LABEL_CLASS: Record<string, string> = {
  word: "ok", word_lemma: "ok", contraction: "ok", compound: "ok",
  cap_word: "cap", proper: "proper", number: "proper", mwe: "mwe", miss: "miss",
};

function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Highlight({ sentence, word }: { sentence: string; word: string }) {
  if (!word) return <>{sentence}</>;
  const idx = sentence.toLowerCase().indexOf(word.toLowerCase());
  if (idx < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, idx)}
      <mark>{sentence.slice(idx, idx + word.length)}</mark>
      {sentence.slice(idx + word.length)}
    </>
  );
}

// S6：书库来源展示与筛选
const SOURCE_LABEL: Record<TextSourceKind, string> = {
  builtin: "素材库", feed: "每日好文", url: "网页", file: "文件", paste: "粘贴", extension: "扩展",
};
const CEFR_ORDER = ["B1", "B2", "C1", "C2"];

function Progress({ rate, brass }: { rate: number; brass?: boolean }) {
  return (
    <div className="prog-track">
      <div className="prog-fill" style={{ width: `${Math.min(100, rate)}%`, background: brass ? "#a16207" : "#2f4d8a" }} />
    </div>
  );
}

function SyllabusPage({ onPickWord }: { onPickWord: (w: string) => void }) {
  const groupsQ = useAsync(() => api.syllabusList(), []);
  const groups = groupsQ.data;
  const [tag, setTag] = useState<SyllabusGroup | null>(null);
  const [rows, setRows] = useState<SyllabusWord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(async (t: string, query: string, off: number, append: boolean) => {
    setLoading(true);
    try {
      const r = await api.syllabusWords({ tag: t, q: query, offset: off });
      setTotal(r.total); setOffset(off);
      setRows((prev) => (append ? prev.concat(r.rows) : r.rows));
    } finally { setLoading(false); }
  }, []);

  const openGroup = (g: SyllabusGroup) => { setTag(g); setQ(""); setRows([]); loadPage(g.tag, "", 0, false); };
  useEffect(() => {
    if (!tag) return;
    const h = setTimeout(() => loadPage(tag.tag, q, 0, false), 280);
    return () => clearTimeout(h);
  }, [q, tag, loadPage]);

  if (!tag) {
    return (
      <div className="page">
        <div className="page-head">
          <h2>考纲牌组</h2>
          <span className="muted">考纲与学术词牌组 · 已学=阅读中已建卡的词元 · 按词频/子表排序，先攻高频未学</span>
        </div>
        {groupsQ.error ? (
          <ErrorState
            text="考纲牌组加载失败。词表都在本机词典里，重试一下通常就好。"
            onRetry={groupsQ.reload}
            retrying={groupsQ.loading}
          />
        ) : !groups ? <p className="muted">加载中…</p> : (
          <div className="syl-grid">
            {groups.map((g) => (
              <button key={g.tag} className="syl-card" onClick={() => openGroup(g)}>
                <div className="syl-card-head">
                  <b>{g.label}</b><em>{g.tag}</em>
                </div>
                <div className="syl-num"><i>{g.learned}</i> / {g.total} <span>已学 · {g.rate}%</span></div>
                <Progress rate={g.rate} brass />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>{tag.label}词表 <span className="muted">{tag.tag}</span></h2>
        <button className="ghost2" onClick={() => setTag(null)}>← 全部牌组</button>
        <input className="syl-search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="搜索英文或中文释义…" />
        <span className="muted">{total} 词 · 已显示 {rows.length}</span>
      </div>
      <div className="list">
        {rows.map((r) => (
          <div key={r.word} className={"list-item syl-row clickable" + (r.learned ? " is-learned" : "")}
            onClick={() => onPickWord(r.word)}>
            <span className="syl-word">{r.sub ? <em className="awl-sub" title={`AWL 子表 ${r.sub}（1 最高频）`}>S{r.sub}</em> : null}{r.word}{r.learned && <em className="learned-flag">已学</em>}</span>
            <span className="syl-phon">{r.phonetic ? `/${r.phonetic}/` : ""}</span>
            <span className="li-sense">{r.gloss}</span>
          </div>
        ))}
      </div>
      {rows.length < total && (
        <button className="primary" style={{ marginTop: 14 }} disabled={loading}
          onClick={() => loadPage(tag.tag, q, offset + 100, true)}>
          {loading ? "加载中…" : `加载更多（还剩 ${total - rows.length}）`}
        </button>
      )}
      {!loading && rows.length === 0 && <p className="muted">没有匹配的词</p>}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<"today" | "read" | "feed" | "review" | "shadow" | "lex" | "syl" | "exam" | "dash" | "voice" | "recycle" | "chat" | "call" | "settings">("today");

  // 阅读域
  const [texts, setTexts] = useState<TextCard[]>([]);
  const [textTotal, setTextTotal] = useState(0);
  const [textTotalAll, setTextTotalAll] = useState(0);
  const [srcFilter, setSrcFilter] = useState<TextSourceKind | "">("");
  const [cefrFilter, setCefrFilter] = useState<string>("");
  const [textSort, setTextSort] = useState<"recent" | "words" | "cefr" | "rate" | "lookups">("recent");
  const [textLimit, setTextLimit] = useState(24);
  const [builtins, setBuiltins] = useState<BuiltIn[]>([]);
  const [genre, setGenre] = useState("全部");
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [ann, setAnn] = useState<Annotated | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [entryStart, setEntryStart] = useState(0);
  const [entryKey, setEntryKey] = useState("");
  const [senseIdx, setSenseIdx] = useState(0);
  const [enOpen, setEnOpen] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlPreview, setUrlPreview] = useState<UrlPreview | null>(null);
  const [transOn, setTransOn] = useState(false);
  const [trans, setTrans] = useState<{ en: string; zh: string; pairs: [string, string][] }[] | null>(null);
  const [rawText, setRawText] = useState("");
  // S7b 离线机翻（Bergamot）：mt=true 表示当前 trans 来自机翻（界面标“机翻参考”）
  const [mt, setMt] = useState<{ revision: string } | null>(null);
  const [mtBusy, setMtBusy] = useState<{ phase: "download" | "translate"; pct: number; msg: string } | null>(null);
  const [mtErr, setMtErr] = useState("");
  const mtRunRef = useRef(0);
  const [selTrans, setSelTrans] = useState<{ en: string; zh: string } | null>(null);
  const [selText, setSelText] = useState(""); // 阅读器中当前选中的英文（用于送跟读）
  // 「转为练习」时一并带上划词选中的配对译文（selTrans.zh），供资产存成
  // payload.zh_reference —— 翻译卡没有它就只能自评（#205）
  const [capSel, setCapSel] = useState<{ text: string; zh?: string } | null>(null);
  // S15-1 阅读划选云端语法深度分析
  const [readGrammar, setReadGrammar] = useState<GrammarAnalysis | null>(null);
  const [readGrammarBusy, setReadGrammarBusy] = useState(false);
  const [readGrammarMsg, setReadGrammarMsg] = useState("");
  // 送到跟读台的目标句（nonce 用自增计数，保证同一句重复送也会刷新）
  const [shadowSend, setShadowSend] = useState<{
    text: string; nonce: number; textId?: number; title?: string;
    originKind?: string; originRef?: string;
  } | null>(null);
  const nonceRef = useRef(createNonce());
  const sendToShadow = (
    text: string,
    opts?: { textId?: number; title?: string; originKind?: string; originRef?: string },
) => {
    const t = text.trim();
    if (!t) return;
    setShadowSend({
      text: t, nonce: nonceRef.current(),
      textId: opts?.textId, title: opts?.title,
      originKind: opts?.originKind, originRef: opts?.originRef,
    });
    setTab("shadow");
  };

  // S15-1：阅读划选句云端语法深度分析（再点一次收起）
  const openReadGrammar = async () => {
    if (readGrammar) { setReadGrammar(null); return; }
    const text = selText.trim();
    if (!text) return;
    setReadGrammarBusy(true); setReadGrammarMsg("");
    try {
      const r = await analyzeGrammar(text, "");
      if (r.ok) setReadGrammar(r.analysis);
      else {
        const reason = r.reason;
        setReadGrammarMsg(
          reason === "grammar_consent_off" ? "需先在对话页云端设置勾选「文本送云端做语法深度分析」"
            : reason === "cloud_key_missing" ? "请先在对话页云端设置保存 API Key"
            : reason === "bad_json" || reason.startsWith("schema_failed") ? "结构化分析失败，可重试"
            : "深度分析失败：" + reason,
        );
      }
    } finally {
      setReadGrammarBusy(false);
    }
  };
  // S11-c 跟读续练（1/3/7 到期句队列）
  const [shadowReviewNonce, setShadowReviewNonce] = useState(0);
  const openShadowReview = () => { setShadowReviewNonce((n) => n + 1); setTab("shadow"); };

  // 复习域
  const [counts, setCounts] = useState<Counts | null>(null);
  const [streak, setStreak] = useState(0);
  const [glassOn, toggleGlass] = useGlassPref();
  const TAB_SEQ = ["today", "read", "feed", "review", "shadow", "chat", "call", "lex", "syl", "exam", "dash", "voice"];
  const prevTabRef = useRef("today");
  const [pageDir, setPageDir] = useState<"fwd" | "back">("fwd");
  useEffect(() => {
    const a = TAB_SEQ.indexOf(prevTabRef.current), b = TAB_SEQ.indexOf(tab);
    if (a !== -1 && b !== -1 && a !== b) setPageDir(b > a ? "fwd" : "back");
    prevTabRef.current = tab;
  }, [tab]);
  const [celebrate, setCelebrate] = useState("");
  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const pill = nav.querySelector(".nav-pill") as HTMLElement | null;
    if (!pill) return;
    const active = nav.querySelector(".nav-item.active") as HTMLElement | null;
    if (active) {
      pill.style.opacity = "1";
      pill.style.height = active.offsetHeight + "px";
      pill.style.transform = "translateY(" + active.offsetTop + "px)";
    } else { pill.style.opacity = "0"; }
  }, [tab]);
  const onNavPress = (e: React.PointerEvent) => {
    const btn = (e.target as HTMLElement).closest(".nav-item") as HTMLElement | null;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    btn.style.setProperty("--px", (e.clientX - r.left) + "px");
  };
  const lvl = 1 + Math.floor((counts?.total_lexemes ?? 0) / 100);
  useEffect(() => { api.insights(7).then((r) => setStreak(r.streak?.current ?? 0)).catch(() => { /* 侧栏 streak 留 0 */ }); }, []);
  const [today, setToday] = useState<TodayBrief | null>(null);
  const [drafts, setDrafts] = useState<DebriefDraft[]>([]);
  const [debrief, setDebrief] = useState<{ ctx: DebriefContext; initial: DebriefCandidate[] } | null>(null);
  const [learnedSummary, setLearnedSummary] = useState<TextLearnedSummary | null>(null);
  const [usePrompt, setUsePrompt] = useState<UsePrompt | null>(null);
  const [useCounts, setUseCounts] = useState<{
    used_spontaneously: number; used_prompted: number;
    used_after_correction: number; recognized: number;
  } | null>(null);
  const [weaknesses, setWeaknesses] = useState<PriorityDto[]>([]);
  const [examWeak, setExamWeak] = useState<ExamWeakItem[]>([]);
  const [examDrill, setExamDrill] = useState<ExamWeakItem | null>(null);
  // S11-b 漏网词回收
  const [recycleItems, setRecycleItems] = useState<RecycleItem[]>([]);
  const [recycleTotal, setRecycleTotal] = useState(0);
  const [recycleMultiOnly, setRecycleMultiOnly] = useState(true);
  const [recycleSel, setRecycleSel] = useState<Set<string>>(new Set());
  const [recycleBusy, setRecycleBusy] = useState(false);
  const [recycleMsg, setRecycleMsg] = useState("");
  const [recycleFrom, setRecycleFrom] = useState<"today" | "lex">("today");
  const [assessView, setAssessView] = useState(false);
  useEffect(() => {
    if (assessView) document.querySelector<HTMLElement>(".main")?.scrollTo({ top: 0 });
  }, [assessView]);
  const RECYCLE_PAGE = 50;
  const [queue, setQueue] = useState<ReviewCard[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [lastResult, setLastResult] = useState("");
  const [guess, setGuess] = useState("");
  const [chunkRef, setChunkRef] = useState<string | null>(null); // 词块自写的中文（#200）
  const [checked, setChecked] = useState<null | boolean>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const card = queue[0];
  const done = queueTotal - queue.length;
  const pendingInput = card
    ? (card.card_type === "chunk_recall" && chunkRef === null && checked === null) ||
      (card.card_type === "cloze" && !card.clozeMiss && checked === null) ||
      card.card_type === "spelling" && checked === null ||
      ((card.card_type === "recall" || card.card_type === "l_recog") && !!card.choices?.length && checked === null)
    : false;

  // 听音辨义卡：切到新卡自动播放发音（本地 SAPI TTS）
  const [ttsStatus, setTtsStatus] = useState<TtsStatus>({ phase: "idle", engine: null });
  useEffect(() => { warmTts(); }, []);
  useEffect(() => onTtsStatus(setTtsStatus), []);
  // 进入复习页即后台预热神经语音（未安装静默跳过），把首次加载挡在第一张听音卡之前
  useEffect(() => { if (tab === "review") prewarmKokoro(); }, [tab]);
  useEffect(() => {
    if (card?.card_type === "l_recog" || card?.card_type === "spelling"
      || card?.card_type === "pron_perception") speak(card.word);
  }, [card?.card_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 词库域
  const [lexemes, setLexemes] = useState<LexemeInfo[]>([]);
  const [lexTotal, setLexTotal] = useState(0);
  const [lexQ, setLexQ] = useState("");
  const [lexOffset, setLexOffset] = useState(0);
  const [lexLoading, setLexLoading] = useState(false);
  const [lexDetail, setLexDetail] = useState<LexemeDetail | null>(null);
  const [lexSort, setLexSort] = useState<LexSort>("created");
  const [lexView, setLexView] = useState<"list" | "graph">("graph");
  const [graphCenter, setGraphCenter] = useState<{ word: string; lapses: number; cards: number; tag: string } | null>(null);
  const [addQ, setAddQ] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState("");
  // 星云图的两个入参按引用稳定化：LexGraph 的建图 effect 依赖它们，
  // 每次渲染新建 Set/内联箭头会让整张图重算重绘（#193）。
  const lexLearnedSet = useMemo(
    () => new Set(lexemes.map((l) => String(l.lemma).toLowerCase())),
    [lexemes]);
  const pickGraphCenter = useCallback((word: string) => {
    setGraphCenter((c) => (c?.word === word ? c : { word, lapses: 0, cards: 0, tag: "" }));
  }, []);
  // 星云中心词候选：默认取最新词元
  useEffect(() => {
    if (tab !== "lex" || lexView !== "graph" || graphCenter || lexemes.length === 0) return;
    const l = lexemes[0];
    setGraphCenter({ word: l.lemma, lapses: Number(l.lapses) || 0, cards: Number(l.cards) || 0, tag: l.tag || "" });
  }, [tab, lexView, graphCenter, lexemes]);
  // 搜索 → 查词典 → 一键加入词卡（createStandaloneNote）
  const addWordToCards = async () => {
    const w = addQ.trim().toLowerCase();
    if (!w) return;
    setAddBusy(true); setAddMsg("");
    try {
      const r = await api.createStandaloneNote({ word: w, label: "word", phrase: null, sense: "" });
      setAddMsg(r.already ? "该词已在复习队列" : `已加入复习：${r.cards_created} 张卡`);
      setAddQ("");
    } catch (e) { setAddMsg(String((e as Error).message).slice(0, 80)); }
    finally { setAddBusy(false); }
  };
  const [lexGroup, setLexGroup] = useState<"date" | "source">("date");
  const [jumpCtx, setJumpCtx] = useState<{ word: string; sentence: string } | null>(null); // 回语境：词+例句
  const LEVEL_LABEL: Record<string, string> = { zk: "中考", gk: "高考", cet4: "四级", cet6: "六级", ky: "考研", ielts: "雅思", toefl: "托福", gre: "GRE" };
  const loadLex = useCallback(async (q: string, off: number, append: boolean, sort: LexSort) => {
    setLexLoading(true);
    try {
      const r = await api.listLexemes({ q, offset: off, sort });
      setLexTotal(r.total); setLexOffset(off);
      setLexemes((prev) => (append ? prev.concat(r.rows) : r.rows));
    } catch (e) { setErr(String(e)); }
    finally { setLexLoading(false); }
  }, []);
  const goLex = useCallback(() => {
    setTab("lex"); setLexQ(""); loadLex("", 0, false, "created");
  }, [loadLex]);
  // 搜索防抖 / 排序变化（进入词库页、查询词或排序变化时重载第一页；分组为前端切换不请求）
  useEffect(() => {
    if (tab !== "lex") return;
    const h = setTimeout(() => loadLex(lexQ, 0, false, lexSort), 260);
    return () => clearTimeout(h);
  }, [lexQ, tab, lexSort, loadLex]);
  const openLex = useCallback(async (id: number) => {
    if (lexDetail?.id === id) { setLexDetail(null); return; }
    try { setLexDetail(await api.lexemeDetail(id)); }
    catch (e) { setErr(String(e)); }
  }, [lexDetail]);

  const fmtDue = (state: number, due: number) => {
    if (state === 0) return "新卡";
    const diff = due - Date.now();
    if (diff <= 0) return "已到期";
    const m = Math.round(diff / 60000);
    if (m < 60) return `${m} 分钟后`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} 小时后`;
    return `${Math.round(h / 24)} 天后`;
  };
  const typeName = (t: string) => (t === "cloze" ? "挖空" : t === "recall" ? "释义→词" : "认读");

  const refreshCounts = useCallback(async () => {
    try { setCounts(await api.counts()); } catch (e) { setErr(String(e)); }
  }, []);
  const refreshToday = useCallback(async () => {
    try { setToday(await api.todayBrief()); } catch { /* 今日页留空，不阻塞 */ }
    try { setDrafts(await api.debriefList()); } catch { /* 待复盘留空 */ }
    try { setWeaknesses(await api.priorityList({ limit: 3 })); } catch { /* 弱点留空 */ }
    try { setExamWeak(await api.examWeakList({ limit: 3 })); } catch { /* 考后薄弱留空 */ }
  }, []);
  useEffect(() => { if (tab === "today") void refreshToday(); }, [tab, refreshToday]);

  const loadRecycle = useCallback(async (multiOnly: boolean, append = false) => {
    try {
      const r = await api.recycleCandidates({
        minTexts: multiOnly ? 2 : 1, limit: RECYCLE_PAGE,
        offset: append ? recycleItems.length : 0,
      });
      setRecycleItems((prev) => append ? [...prev, ...r.items] : r.items);
      setRecycleTotal(r.total);
    } catch (e) { setErr(String(e)); }
  }, [recycleItems.length]);
  const openRecycle = useCallback((from: "today" | "lex" = "today") => {
    setRecycleFrom(from);
    setTab("recycle"); setRecycleMsg(""); setRecycleSel(new Set());
    void loadRecycle(recycleMultiOnly);
  }, [recycleMultiOnly, loadRecycle]);
  const recycleAdd = useCallback(async (lemmas: string[]) => {
    if (!lemmas.length) return;
    setRecycleBusy(true);
    try {
      const r = await api.recycleAdd(lemmas);
      setRecycleMsg(`已加入复习 ${r.added.length} 个词`
        + (r.already.length ? `，${r.already.length} 个已在词库` : "")
        + (r.skipped.length ? `，跳过 ${r.skipped.length} 个` : ""));
      setRecycleSel(new Set());
      await loadRecycle(recycleMultiOnly);
      void refreshCounts(); void refreshToday();
    } catch (e) { setErr(String(e)); }
    finally { setRecycleBusy(false); }
  }, [recycleMultiOnly, loadRecycle, refreshCounts, refreshToday]);
  const refreshTexts = useCallback(async () => {
    try {
      const r = await api.listTexts({
        limit: textLimit, sort: textSort,
        kind: srcFilter || "", cefr: cefrFilter || "",
      });
      setTexts(r.items); setTextTotal(r.total); setTextTotalAll(r.totalAll);
    } catch (e) { setErr(String(e)); }
  }, [textLimit, textSort, srcFilter, cefrFilter]);
  useEffect(() => {
    refreshCounts(); refreshTexts();
    api.builtinsList().then(setBuiltins).catch((e) => setErr(String(e)));
  }, [refreshCounts, refreshTexts]);

  // —— 阅读动作 ——
  const annotateNow = useCallback(async (raw: string, source?: Parameters<typeof api.annotate>[2]) => {
    setBusy(true); setErr(""); setEntry(null); setEntryKey(""); setCreateMsg("");
    setRawText(raw); setMt(null); setMtBusy(null); setMtErr(""); mtRunRef.current++;
    inference.release("translation").catch(() => {});
    try {
      const a = await api.annotate(raw, undefined, source);
      setAnn(a);
      setTransOn(false); setSelTrans(null); setSelText(""); setReadGrammar(null);
      api.transForText(a.text_id).then((r) => setTrans(r ? r.paras : null)).catch(() => setTrans(null));
      refreshTexts();
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }, [refreshTexts]);

  const openBuiltin = useCallback(async (id: string) => {
    setBusy(true); setErr("");
    try {
      const b = await api.getBuiltin(id);
      if (b) await annotateNow(b.text, { kind: "builtin", label: b.title, externalRef: b.id });
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }, [annotateNow]);

  // 词卡跳转原文：重载文章到阅读页并定位该词
  const jumpToText = useCallback(async (textId: number, word: string, sentence = "") => {
    try {
      const t = await api.getText(textId);
      if (!t) return;
      setLexDetail(null);
      await annotateNow(t.raw_text);
      setTab("read");
      setJumpCtx({ word, sentence });
    } catch (e) { setErr(String(e)); }
  }, [annotateNow]);

  const importFiles = useCallback(async (fileList: FileList | File[]) => {
    const paths = Array.from(fileList).map((f) => api.pathForFile(f)).filter(Boolean);
    if (paths.length === 0) return;
    setImporting(true); setErr(""); setImportMsg("");
    try {
      const results = await api.importFiles(paths);
      const ok = results.filter((r) => r.ok);
      const bad = results.filter((r) => !r.ok);
      const parts: string[] = [];
      if (ok.length) parts.push(`成功导入 ${ok.length} 篇`);
      for (const b of bad) parts.push(`${b.file}：${b.error}`);
      setImportMsg(parts.join(" ｜ "));
      refreshTexts(); refreshCounts();
    } catch (e) { setErr(String(e)); }
    finally { setImporting(false); }
  }, [refreshTexts, refreshCounts]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.length) importFiles(e.dataTransfer.files);
  }, [importFiles]);

  // —— V4 URL 导入：抓取预览 → 确认入库精读 ——
  const fetchUrlPreview = useCallback(async () => {
    if (!urlInput.trim()) return;
    setUrlBusy(true); setErr(""); setUrlPreview(null);
    try { setUrlPreview(await api.fetchUrl(urlInput.trim())); }
    catch (e) { setErr(String(e)); }
    finally { setUrlBusy(false); }
  }, [urlInput]);

  const saveUrlPreview = useCallback(async () => {
    if (!urlPreview) return;
    setBusy(true); setErr("");
    try {
      const a = await api.annotate(urlPreview.text, urlPreview.title, {
        kind: "url", uri: urlPreview.url, externalRef: urlPreview.url, label: urlPreview.title,
      });
      setAnn(a);
      setRawText(urlPreview.text); setMt(null); setMtBusy(null); setMtErr(""); mtRunRef.current++;
      inference.release("translation").catch(() => {});
      setTransOn(false); setSelTrans(null); setSelText(""); setReadGrammar(null);
      api.transForText(a.text_id).then((r) => setTrans(r ? r.paras : null)).catch(() => setTrans(null));
      setUrlOpen(false); setUrlPreview(null); setUrlInput("");
      refreshTexts();
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }, [urlPreview, refreshTexts]);

  // 浏览器扩展一键发送到达时刷新书库并提示
  useEffect(() => api.onIngested((p) => {
    refreshTexts(); refreshCounts();
    setImportMsg(`已从浏览器接收到文章：${p.title || "未命名"}`);
  }), [refreshTexts, refreshCounts]);

  // S9-1 阅读会话：打开文章开始计时（仅前台可见），切文章/回书库/卸载时关闭；杀进程由主进程回收兜底
  const readSessionRef = useRef<SessionTracker | null>(null);
  if (!readSessionRef.current) readSessionRef.current = new SessionTracker();
  const readBaselineRef = useRef(0); // 本次打开时的阅读起点（词偏移），只统计向前推进的词
  const annTextId = ann?.text_id ?? null;
  useEffect(() => {
    setLearnedSummary(null);
    if (annTextId == null) return;
    let alive = true;
    api.textLearnedSummary(annTextId)
      .then((r) => { if (alive) setLearnedSummary(r); })
      .catch((e) => { console.error("[reader] 学过词统计加载失败", e); });
    return () => { alive = false; };
  }, [annTextId]);
  useEffect(() => {
    const tr = readSessionRef.current!;
    if (annTextId == null) { void tr.stop(); return; }
    const title = (rawText || "").trim().split(/\n/)[0]?.slice(0, 60) || `文章 #${annTextId}`;
    readBaselineRef.current = 0;
    let cancelled = false;
    void tr.start("read", {
      refType: "text", refId: String(annTextId), titleSnapshot: title,
      unit: "words", amount: 0,
    });
    // 基线 = 断点续学锚点位置；本次只统计从基线向前推进的词
    (async () => {
      try {
        const r = await api.resumeGet("reading");
        if (cancelled || !r || r.refId !== String(annTextId)) return;
        readBaselineRef.current = wordsUpToAnchor({
          pi: Number(r.locator?.pi ?? 0), ch: Number(r.locator?.ch ?? 0),
        });
      } catch { /* 基线保持 0 */ }
    })();
    return () => { cancelled = true; void tr.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annTextId]);

  const backToLibrary = useCallback(() => {
    const tid = ann?.text_id ?? null;
    if (tid != null) {
      api.textDebriefCandidates(tid).then((cs) => {
        if (cs.length) return api.debriefPut({ origin_kind: "reading", origin_ref: String(tid), candidates: cs });
      }).catch((e) => { console.error("[reader] 复盘候选落库失败", e); });
    }
    setAnn(null); setText(""); setEntry(null); setEntryStart(0); setEntryKey(""); setCreateMsg(""); setComposing(false);
    setSelTrans(null); setSelText(""); setReadGrammar(null); setRawText(""); setMt(null); setMtBusy(null); setMtErr(""); mtRunRef.current++;
    inference.release("translation").catch(() => {});
    refreshTexts();
    api.debriefList().then(setDrafts).catch((e) => { console.error("[debrief] 草稿列表加载失败", e); });
  }, [ann, refreshTexts]);

  // v2.15.1 书库删除文章：  // S13-a-2 复盘：手动复盘本文
  const openTextDebrief = useCallback(async (tid: number) => {
    try {
      const cs = await api.textDebriefCandidates(tid);
      if (!cs.length) { setErr("没有需要复盘的内容（查过的词都已建卡）"); return; }
      const title = texts.find((t) => t.id === tid)?.title || "文章";
      setDebrief({ ctx: { originKind: "reading", originRef: String(tid), title }, initial: cs });
    } catch (e) { setErr(String(e)); }
  }, [texts]);

  const openDraftDebrief = useCallback((d: DebriefDraft) => {
    let cs: DebriefCandidate[] = [];
    try { cs = JSON.parse(d.candidates_json) as DebriefCandidate[]; } catch { cs = []; }
    if (!cs.length) { void api.debriefSetStatus(d.draft_key, "skipped"); return; }
    const title = d.origin_kind === "reading"
      ? (texts.find((t) => String(t.id) === d.origin_ref)?.title || "文章")
      : d.origin_kind === "conversation" ? "对话复盘" : "复盘";
    setDebrief({
      ctx: {
        originKind: d.origin_kind, originRef: d.origin_ref, title,
        sessionKey: d.origin_kind === "conversation" ? d.origin_ref : undefined,
      },
      initial: cs,
    });
  }, [texts]);

  // v2.15.1 书库删除文章：core 级联清理笔记/卡片/证据/来源/译文与孤儿词元；当日首启快照可回滚
  const deleteTextCard = useCallback(async (t: TextCard) => {
    const ok = await confirmDialog({
      title: `删除《${t.title || "无标题"}》？`,
      body: "该文章的笔记、卡片与查词记录会一并删除（其他文章仍在用的共享词元保留）。今日启动时已自动生成备份快照，可回滚。",
      danger: true, okLabel: "删除", cancelLabel: "取消",
    });
    if (!ok) return;
    try {
      await api.textDelete(t.id);
      if (ann?.text_id === t.id) backToLibrary();
      await Promise.all([refreshTexts(), refreshCounts()]);
      toast(`已删除《${t.title || "无标题"}》`);
    } catch (e) { setErr(String(e)); }
  }, [ann, backToLibrary, refreshTexts, refreshCounts]);

  // 阅读器段落（与 data-pi 同一切分口径；机翻按此索引缓存）
  const readerParas = useMemo(() => (ann ? paragraphsFromAnn(ann, rawText) : []), [ann, rawText]);

  // S13-d-1 句子跟读通过标记（按句文本匹配，来源删除不影响）
  const [shadowPassMap, setShadowPassMap] = useState<Record<string, boolean>>({});
  const readerSentences = useMemo(() => {
    const out = [];
    for (const p of readerParas) {
      const ms = p.match(/\S.*?(?:[.!?](?=\s|$)|$)/g) || [];
      for (const m of ms) {
        const t = m.trim();
        if (t) out.push(t);
      }
    }
    return out;
  }, [readerParas]);
  useEffect(() => {
    let alive = true;
    if (!readerSentences.length) { setShadowPassMap({}); return; }
    api.shadowPassedForSentences(readerSentences).then((flags) => {
      if (!alive) return;
      const map: Record<string, boolean> = {};
      flags.forEach((f, i) => {
        if (f) map[readerSentences[i].replace(/\s+/g, " ").trim()] = true;
      });
      setShadowPassMap(map);
    }).catch((e) => { console.error("[reader] 跟读通过状态加载失败", e); });
    return () => { alive = false; };
  }, [readerSentences]);

  // 从文章开头到锚点（段 pi + 段内字符 ch）累计了多少词
  const wordsUpToAnchor = useCallback((a: { pi: number; ch: number }) => {
    const countW = (sx: string) => (sx.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
    let cnt = 0;
    for (let i = 0; i < a.pi && i < readerParas.length; i++) cnt += countW(readerParas[i] || "");
    cnt += countW((readerParas[a.pi] || "").slice(0, a.ch));
    return cnt;
  }, [readerParas]);

  // S9-2 断点续学：滚动位置 5s 节流落库（段落 pi + 段内字符 ch + 段内容 SHA256），打开旧文章恢复；哈希漂移回开头
  const readerRef = useRef<HTMLDivElement | null>(null);
  const [resumeNotice, setResumeNotice] = useState("");
  const resumeTimerRef = useRef<number | null>(null);
  const anchorMapRef = useRef<Map<number, { pi: number; ch: number }>>(new Map());
  // 跳词高亮的定时器句柄（见下方 effect 的 cleanup）
  const flashTimers: number[] = useRef<number[]>([]).current;

  const resumeRestoredRef = useRef<{ id: number; pi: number; reanchored: boolean } | null>(null);
  const resumeSkipRef = useRef(false); // 词卡跳词定位优先于断点恢复

  // 显式滚动 .main 到指定段（比 scrollIntoView 在嵌套滚动容器下更确定）
  const scrollToPara = useCallback((el: HTMLElement) => {
    const scroller = document.querySelector<HTMLElement>(".main");
    if (scroller) {
      const base = scroller.getBoundingClientRect().top + 12;
      scroller.scrollTop += el.getBoundingClientRect().top - base;
    } else {
      el.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }, []);

  // 文章渲染后回语境：优先定位例句所在段，再在段内找词（含屈折形态）并闪烁（jumpToText 触发）
  useEffect(() => {
    if (!jumpCtx || tab !== "read" || !ann) return;
    const h = window.setTimeout(() => {
      const reader = readerRef.current;
      if (!reader) { setJumpCtx(null); return; }
      const want = jumpCtx.word.toLowerCase();
      const prefix = want.slice(0, Math.max(4, want.length - 3));
      const wordMatch = (el: HTMLElement) => {
        const t = (el.textContent || "").toLowerCase();
        if (t === want) return true;
        // 屈折形态回退：investigated/investigating/studies 等，长度差 ≤4
        return t.length >= 4 && Math.abs(t.length - want.length) <= 4 && t.startsWith(prefix);
      };
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      let para: HTMLElement | null = null;
      if (jumpCtx.sentence) {
        const needle = norm(jumpCtx.sentence).slice(0, 40);
        for (const p of Array.from(reader.querySelectorAll<HTMLElement>("p[data-pi]"))) {
          if (needle && norm(p.textContent || "").includes(needle)) { para = p; break; }
        }
      }
      const scope: HTMLElement = para ?? reader;
      const hits = Array.from(scope.querySelectorAll<HTMLElement>(".tk")).filter(wordMatch);
      resumeSkipRef.current = true;
      const target: HTMLElement | null = hits[0] ?? para;
      if (target) scrollToPara(target);
      // 命中 N 个词就建 N 个定时器；effect 重跑/组件卸载时必须一并撤掉，
      // 否则 2400ms 后会对已卸载的 DOM 执行 classList.remove（#196）。
      flashTimers.forEach((id) => window.clearTimeout(id));
      flashTimers.length = 0;
      for (const el of hits) {
        el.classList.add("jump-flash");
        flashTimers.push(window.setTimeout(() => el.classList.remove("jump-flash"), 2400));
      }
      setJumpCtx(null);
    }, 180);
    return () => {
      window.clearTimeout(h);
      flashTimers.forEach((id) => window.clearTimeout(id));
      flashTimers.length = 0;
    };
  }, [jumpCtx, tab, ann, scrollToPara]);

  const computeAnchor = useCallback(() => {
    const reader = readerRef.current;
    if (!reader) return null;
    const ps = Array.from(reader.querySelectorAll<HTMLElement>("p[data-pi]"));
    if (!ps.length) return null;
    const y = Math.max(80, reader.getBoundingClientRect().top + 10);
    let pi = 0;
    for (const el of ps) {
      pi = Number(el.dataset.pi);
      if (el.getBoundingClientRect().bottom >= y) break;
    }
    // 段内字符偏移：用光标 API 取视口线在段 DOM 中的字符位置（恢复粒度以段落为准，ch 留给深链/精确定位）
    let ch = 0;
    try {
      const x = reader.getBoundingClientRect().left + 30;
      const doc = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };
      let node: Node | null = null;
      let off = 0;
      const cp = doc.caretPositionFromPoint?.(x, y);
      if (cp) { node = cp.offsetNode; off = cp.offset; }
      else { const rg = doc.caretRangeFromPoint?.(x, y); if (rg) { node = rg.startContainer; off = rg.startOffset; } }
      const host = node ? (node.nodeType === 3 ? node.parentElement : node as HTMLElement) : null;
      const pEl = host?.closest("p[data-pi]") as HTMLElement | null;
      if (pEl && ps[pi] === pEl && pEl.firstChild && node) {
        const range = document.createRange();
        range.setStartBefore(pEl.firstChild);
        range.setEnd(node, off);
        ch = range.toString().length;
      }
    } catch { ch = 0; }
    return { pi, ch: Math.max(0, ch) };
  }, []);

  const flushResume = useCallback(async (textId: number, cached?: { pi: number; ch: number }) => {
    const a = cached ?? anchorMapRef.current.get(textId) ?? computeAnchor();
    if (!a) return;
    const para = readerParas[a.pi] ?? "";
    const hash = para ? await sha256Hex(para) : "";
    try {
      await api.resumePut("reading", String(textId), { pi: a.pi, ch: a.ch }, hash);
    } catch { /* 位置保存失败不阻塞阅读 */ }
  }, [computeAnchor, readerParas]);

  // 追踪：滚动后最多 5s 落一次；隐藏/卸载/切文章立即补落
  useEffect(() => {
    if (annTextId == null) return;
    resumeSkipRef.current = false;
    resumeRestoredRef.current = null;
    let disposed = false;
    const curId = annTextId;
    const reportProgress = (a: { pi: number; ch: number }) => {
      readSessionRef.current?.setAmount(
        Math.max(0, wordsUpToAnchor(a) - readBaselineRef.current));
    };
    const onScroll = () => {
      const a = computeAnchor();
      if (a) { anchorMapRef.current.set(curId, a); reportProgress(a); }
      if (resumeTimerRef.current != null) return;
      resumeTimerRef.current = window.setTimeout(() => {
        resumeTimerRef.current = null;
        if (!disposed) void flushResume(curId, anchorMapRef.current.get(curId));
      }, 5000);
    };
    const onHidden = () => { if (document.visibilityState === "hidden") void flushResume(curId, anchorMapRef.current.get(curId)); };
    const onUnload = () => { void flushResume(curId, anchorMapRef.current.get(curId)); };
    // 实际滚动容器是 .main（flex+overflow-y:auto），window 本身不滚动；找不到时退回 window
    const scroller = document.querySelector<HTMLElement>(".main") ?? window;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onUnload);
    const initH = window.setTimeout(() => { const a = computeAnchor(); if (a) reportProgress(a); }, 500);
    return () => {
      disposed = true;
      window.clearTimeout(initH);
      if (resumeTimerRef.current != null) { window.clearTimeout(resumeTimerRef.current); resumeTimerRef.current = null; }
      scroller.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onUnload);
      // 切文章/回书库：用本文缓存的最后锚点立即补落（此时 DOM 可能已是新文章）
      void flushResume(curId, anchorMapRef.current.get(curId));
      anchorMapRef.current.delete(curId);
    };
  }, [annTextId, flushResume, wordsUpToAnchor]);

  // 恢复：打开旧文章 220ms 后按锚点段落归位；哈希漂移回开头并提示；词卡跳词优先
  useEffect(() => {
    if (annTextId == null) return;
    let cancelled = false;
    // 内部还嵌套了 3 个 setTimeout（提示消失 ×2 + 二次校准滚动），原来只清了外层 h。
    // 组件卸载后它们仍会触发；虽然有 cancelled 挡住 setState，但定时器本身白白留着，
    // 且 cancelled 只在 cleanup 里被置位、回调持有的是同一闭包——统一登记才能真撤干净（#196）。
    const nested: number[] = [];
    const later = (fn: () => void, ms: number) => {
      nested.push(window.setTimeout(() => { if (!cancelled) fn(); }, ms));
    };
    const h = window.setTimeout(async () => {
      if (resumeSkipRef.current) return;
      try {
        const r = await api.resumeGet("reading");
        if (cancelled) return;
        if (!r || r.refId !== String(annTextId)) return;
        const pi = Number(r.locator?.pi ?? 0);
        const para = readerParas[pi] ?? "";
        const el = readerRef.current?.querySelector<HTMLElement>(`p[data-pi="${pi}"]`);
        if (!el || !para) return;
        const hash = await sha256Hex(para);
        if (r.contentHash && hash !== r.contentHash) {
          setResumeNotice("原文已变化，已从文章开头开始");
          later(() => setResumeNotice(""), 5000);
          return;
        }
        scrollToPara(el);
        // 二次校准：等版面（译文/字体）稳定后再对齐一次
        later(() => scrollToPara(el), 600);
        resumeRestoredRef.current = { id: annTextId, pi, reanchored: false };
        setResumeNotice(`已恢复到上次阅读位置（第 ${pi + 1} 段）`);
        later(() => setResumeNotice(""), 4000);
      } catch { /* 恢复失败留在开头 */ }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(h);
      nested.forEach((id) => window.clearTimeout(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annTextId]);

  // 机翻到达后版面下移，按已恢复段落重新归位一次
  useEffect(() => {
    const rr = resumeRestoredRef.current;
    if (!rr || rr.id !== annTextId || rr.reanchored || !trans) return;
    const el = readerRef.current?.querySelector<HTMLElement>(`p[data-pi="${rr.pi}"]`);
    if (el) { scrollToPara(el); rr.reanchored = true; }
  }, [trans, annTextId]);


  // 翻译模型下载进度（复用 model-progress 通道，只看 bergamot）
  useEffect(() => api.onModelProgress((p) => {
    if (p.id !== translator.modelId) return;
    if (p.phase === "progress" && p.total) {
      const pct = Math.round((((p.index ?? 0) + (p.pct ?? 0) / 100) / p.total) * 100);
      setMtBusy({ phase: "download", pct, msg: "下载离线翻译模型（约 48MB，仅一次）" });
    } else if (p.phase === "installed") {
      setMtBusy({ phase: "download", pct: 100, msg: "模型就绪" });
    }
  }), []);

  // 对照译文开关：内置素材走内置译文；其他文章走 Bergamot 离线机翻（按段缓存、渐进显示）
  const toggleTrans = useCallback(async (on: boolean) => {
    if (!ann) return;
    const run = ++mtRunRef.current;
    setTransOn(on);
    if (!on) { inference.release("translation").catch(() => {}); return; }
    setMtErr("");
    try {
      const builtin = await api.transForText(ann.text_id);
      if (run !== mtRunRef.current) return;
      if (builtin?.paras?.length) { setTrans(builtin.paras); setMt(null); setMtBusy(null); return; }

      const paras = readerParas;
      if (!paras.length) return;
      const cached = await api.mtCacheGet(ann.text_id);
      if (run !== mtRunRef.current) return;
      const shas = await Promise.all(paras.map(sha256Hex));
      const byIdx = new Map(cached.map((c) => [c.paraIndex, c]));
      const arr = paras.map((en, i) => {
        const c = byIdx.get(i);
        if (c && c.status === "ok" && c.sourceSha === shas[i]) return { en, zh: c.zh, pairs: c.pairs };
        return { en, zh: "", pairs: [] as [string, string][] };
      });
      setTrans(arr);
      const cachedRev = cached.find((c) => c.modelRevision)?.modelRevision || "";
      const missing = arr.map((x, i) => (x.zh ? -1 : i)).filter((i) => i >= 0);
      if (!missing.length) { setMt({ revision: cachedRev }); setMtBusy(null); return; }

      setMtBusy({ phase: "download", pct: 0, msg: "检查离线翻译模型" });
      const ens = await api.modelEnsure(translator.modelId);
      if (run !== mtRunRef.current) return;
      if ((ens as { state?: string })?.state === "cancelled") { setMtBusy(null); setTransOn(false); return; }
      await inference.acquire("translation");
      if (run !== mtRunRef.current) return;

      let done = 0;
      for (const idxs of chunkArr(missing, 6)) {
        setMtBusy({ phase: "translate", pct: Math.round((done / missing.length) * 100), msg: "离线翻译中" });
        const out = await translator.translate(idxs.map((i) => paras[i]));
        if (run !== mtRunRef.current) return;
        for (let k = 0; k < idxs.length; k++) {
          const i = idxs[k];
          const zh = out.zh[k] || "";
          const pairs = normalizePairs(out.pairs[k] || [], zh);
          arr[i] = { en: paras[i], zh, pairs };
          try {
            await api.mtCachePut({ textId: ann.text_id, paraIndex: i, source: paras[i], translatedText: zh,
              pairs, engine: translator.engine, modelRevision: translator.revision || "" });
          } catch { /* 单段缓存失败不阻塞阅读 */ }
        }
        done += idxs.length;
        setTrans(arr.slice());
      }
      setMt({ revision: translator.revision || cachedRev });
      setMtBusy(null);
    } catch (e) {
      if (run === mtRunRef.current) { setMtErr((e as Error)?.message || String(e)); setMtBusy(null); }
    }
  }, [ann, readerParas]);

  const openSaved = useCallback(async (id: number) => {
    setBusy(true); setErr("");
    try {
      const t = await api.getText(id);
      await annotateNow(t.raw_text);
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }, [annotateNow]);

  const lookup = useCallback(async (tk: Token) => {
    const key = `t:${tk.start}`;
    if (entry && entryKey === key) { setEntry(null); setEntryStart(0); setEntryKey(""); setCreateMsg(""); return; }
    setEntry(null); setCreateMsg(""); setErr(""); setSenseIdx(0); setEnOpen(false);
    setEntryStart(tk.start); setEntryKey(key);
    try { setEntry(await api.lookup(tk.text, tk.label, tk.phrase ?? null, ann?.text_id ?? null)); }
    catch (e) { setErr(String(e)); }
  }, [ann, entry, entryKey]);

  // 考纲页点词 / 拓展词跳转：走同一词典面板，但不写查词密度（无文章上下文）、不做语境建卡
  const lookupWord = useCallback(async (word: string) => {
    const key = `w:${word.toLowerCase()}`;
    if (entry && entryKey === key) { setEntry(null); setEntryStart(0); setEntryKey(""); setCreateMsg(""); return; }
    setEntry(null); setCreateMsg(""); setErr(""); setSenseIdx(0); setEnOpen(false);
    setEntryStart(0); setEntryKey(key);
    try {
      const r = await api.lookup(word, "word", null, null);
      if (!r) { setEntryKey(""); setErr(`离线词典暂未收录「${word}」`); return; }
      setEntry(r);
    } catch (e) { setEntryKey(""); setErr(String(e)); }
  }, [entry, entryKey]);

  // 义项候选：优先中文释义；词包词（如 Wiktionary 扩展包）无中文时回退英英释义，保证可建卡、不产生空 sense
  const senses = entry
    ? (() => {
        const zh = entry.translation.split("\\n").map((s) => s.trim()).filter(Boolean).slice(0, 12);
        if (zh.length) return zh;
        return entry.definition.split("\\n").map((s) => s.trim()).filter(Boolean).slice(0, 12);
      })()
    : [];
  const sensesAreEnglish = entry ? !entry.translation.split("\\n").some((s) => s.trim()) : false;

  const createCard = useCallback(async () => {
    if (!entry || !ann) return;
    setBusy(true);
    try {
      const r = await api.createNote({
        word: entry.word, label: entry.kind,
        phrase: entry.kind === "mwe" ? entry.lemma : null,
        sense: senses[senseIdx] ?? "", textId: ann.text_id, offset: entryStart,
      });
      setCreateMsg(r.already
        ? "这句话已建过卡"
        : r.merged
          ? `已把语境卡补进已有词卡（认读+挖空+回忆共 ${r.cards_created} 张），词表收录与阅读例句现已合并`
          : `已建 ${r.cards_created} 张卡（认读+挖空+回忆）· 复习页开背，「词库」页可随时查看`);
      refreshCounts();
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }, [entry, ann, senseIdx, senses, refreshCounts, entryStart]);

  // 词表收录（无文章语境）：只生成「释义→词」回忆卡
  const addToList = useCallback(async () => {
    if (!entry) return;
    setBusy(true);
    try {
      const r = await api.createStandaloneNote({
        word: entry.word, label: entry.kind,
        phrase: entry.kind === "mwe" ? entry.lemma : null,
        sense: senses[senseIdx] ?? "",
      });
      setCreateMsg(r.already
        ? "该词已在复习队列（语境卡会在阅读中遇到时补齐）"
        : "已加入复习：生成 1 张「释义→词」卡 · 认读/挖空卡等阅读中遇到时补齐");
      refreshCounts();
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }, [entry, senseIdx, senses, refreshCounts]);

  // 词典面板同根/近义（阅读与考纲页共用面板，都展示）
  const [entryRelated, setEntryRelated] = useState<Related | null>(null);
  useEffect(() => {
    setEntryRelated(null);
    if (!entry) return;
    let alive = true;
    api.relatedWords(entry.lemma || entry.word).then((r) => { if (alive) setEntryRelated(r); }).catch((e) => { console.error("[reader] 近义词加载失败", e); });
    return () => { alive = false; };
  }, [entry]);

  // 可点击的拓展词 chip：点词块在面板内跳查该词（音标/释义/英英/发音），小喇叭直接听发音
  const relatedChips = (list: Related["family"]) =>
    list.map((s) => (
      <span key={s.word} className="syn-chip">
        <button type="button" className="syn syn-link"
          title={`查看「${s.word}」的释义与发音，可加入复习`}
          onClick={() => lookupWord(s.word)}>
          <b>{s.word}</b> {s.gloss}
        </button>
        <button type="button" className="speaker-xs" title={`听 ${s.word} 的发音`} aria-label={`听 ${s.word} 的发音`}
          onClick={(e) => { e.stopPropagation(); speakWord(s.word); }}>🔈</button>
      </span>
    ));

  // —— 复习动作 ——
  const startReview = useCallback(async () => {
    setErr(""); setShowBack(false); setLastResult("");
    try {
      const q = await api.getDue(10);
      setQueue(q); setQueueTotal(q.length);
    } catch (e) { setErr(String(e)); }
  }, []);

  // S9-3 今日页唯一主按钮：①到期/新卡→复习 ②无卡有断点→继续精读 ③都没有→好文
  const todayPrimary = useCallback(async () => {
    const b = today ?? await api.todayBrief();
    if (b.primary === "review") { setTab("review"); await startReview(); }
    else if (b.primary === "reading" && b.resume) { setTab("read"); await openSaved(Number(b.resume.refId)); }
    else setTab("feed");
  }, [today, startReview, openSaved]);

  const rate = useCallback(async (rating: number) => {
    const card = queue[0];
    if (!card) return;
    try {
      const r = await api.answer(card.card_id, rating, 0);
      setLastResult(`下次间隔 ${r.interval_days < 1 ? (r.interval_days * 1440).toFixed(0) + " 分钟" : r.interval_days.toFixed(1) + " 天"}`);
      setQueue((q) => {
        const rest = q.slice(1);
        if (rest.length === 0 && queueTotal > 1) setCelebrate("review-" + Date.now()); // 本轮完成：彩带
        return rest;
      });
      setShowBack(false);
      refreshCounts();
    } catch (e) { setErr(String(e)); }
  }, [queue, queueTotal, refreshCounts]);

  // 词块中文核验：只做「是否为空 + 模糊包含」提示，不做逐字判定（#200）
  const checkChunk = useCallback(() => {
    const card = queue[0];
    const mine = guess.trim();
    if (!card || card.card_type !== "chunk_recall" || !mine) return;
    setChunkRef(mine);
    setChecked(true);
    setShowBack(true);
  }, [guess, queue]);

  const checkCloze = useCallback(() => {
    if (!card) return;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z' \-]/g, "").trim();
    const ok = norm(guess) === norm(card.answer) || norm(guess) === norm(card.word);
    setChecked(ok);
    setShowBack(true);
  }, [card, guess]);

  // 键盘：待作答（填空/选择）时空格一律吞掉绝不翻面；1-4 评分
  useEffect(() => {
    if (tab !== "review" || queue.length === 0) return;
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if ((card?.card_type === "l_recog" || card?.card_type === "spelling"
          || card?.card_type === "pron_perception") && !showBack) speak(card.word); // 听音/听写/发音卡空格=重播
        else if (!pendingInput && !showBack) setShowBack(true);
        return;
      }
      if (pendingInput && e.key === "Enter") {
        e.preventDefault(); checkCloze();
      } else if (showBack && ["1", "2", "3", "4"].includes(e.key)
        && card?.card_type !== "note_translate") {
        rate(Number(e.key));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [tab, queue, showBack, checked, card, checkCloze, rate, pendingInput]);

  // 卡背同根/近义
  const [related, setRelated] = useState<Related | null>(null);
  const [enDefOpen, setEnDefOpen] = useState(false);
  useEffect(() => {
    if (!showBack || !card) { setRelated(null); return; }
    let alive = true;
    api.relatedWords(card.word).then((r) => { if (alive) setRelated(r); }).catch((e) => { console.error("[lex] 近义词加载失败", e); });
    return () => { alive = false; };
  }, [showBack, card]);

  // 换卡时重置作答状态
  useEffect(() => {
    // 换卡时全部作答态归零：guess 是输入框、chunkRef 是词块自写的中文，
    // 不重置会把上一张的作答带到下一张（#200）
    setGuess(""); setChunkRef(null); setChecked(null); setChosen(null);
    setShowBack(false); setEnDefOpen(false);
    setUseCounts(null);
    if (card?.asset_id) {
      api.assetUseCounts(card.asset_id)
        .then(setUseCounts).catch((e) => { console.error("[lex] 用例统计加载失败", e); });
    }
  }, [card?.card_id]);

  const readerMode = tab === "read" && ann !== null;
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="app">
      {ttsStatus.phase !== "idle" && (
        <div className={"tts-pill" + (ttsStatus.phase === "error" ? " err" : "")}>
          {ttsStatus.phase === "loading" ? (ttsStatus.message || "神经语音加载中…")
            : ttsStatus.phase === "speaking" ? (ttsStatus.engine === "kokoro" ? "🔈 神经语音播放中" : "🔈 系统语音播放中")
            : (ttsStatus.message || "语音")}
        </div>
      )}
      <aside className="side">
        <div className="brand">
          <div className="brand-icon">梯</div>
          <div className="brand-text">英语底座<br /><span>个人语言资产</span></div>
        </div>
        <nav className="nav" ref={navRef} onPointerDownCapture={onNavPress}>
          <span className="nav-pill" aria-hidden />
          <button className={tab === "today" ? "nav-item active" : "nav-item"} onClick={() => setTab("today")}>
            <span className="nav-ico"><Icon name="Today" /></span><span>今日</span>
          </button>
          <button className={tab === "read" ? "nav-item active" : "nav-item"} onClick={() => { setTab("read"); if (ann) setAnn(ann); }}>
            <span className="nav-ico"><Icon name="Read" /></span><span>阅读</span>
          </button>
          <button className={tab === "feed" ? "nav-item active" : "nav-item"} onClick={() => setTab("feed")}>
            <span className="nav-ico"><Icon name="Sparkles" /></span><span>好文</span>
          </button>
          <button className={tab === "review" ? "nav-item active" : "nav-item"} onClick={() => setTab("review")}>
            <span className="nav-ico"><Icon name="Layers" /></span><span>复习</span>
            {counts && counts.due_review > 0 && <em className="badge">{counts.due_review}</em>}
          </button>
          <button className={tab === "shadow" ? "nav-item active" : "nav-item"} onClick={() => setTab("shadow")}>
            <span className="nav-ico"><Icon name="Play" /></span><span>跟读</span>
          </button>
          <button className={tab === "chat" ? "nav-item active" : "nav-item"} onClick={() => setTab("chat")}>
            <span className="nav-ico"><Icon name="Chat" /></span><span>对话</span>
          </button>
          <button className={tab === "call" ? "nav-item active" : "nav-item"} onClick={() => setTab("call")}>
            <span className="nav-ico"><Icon name="Call" /></span><span>通话</span>
          </button>
          <button className={tab === "lex" ? "nav-item active" : "nav-item"} onClick={goLex}>
            <span className="nav-ico"><Icon name="Library" /></span><span>词库</span>
          </button>
          <button className={tab === "syl" ? "nav-item active" : "nav-item"} onClick={() => setTab("syl")}>
            <span className="nav-ico"><Icon name="Grad" /></span><span>考纲</span>
          </button>
          <button className={tab === "exam" ? "nav-item active" : "nav-item"} onClick={() => setTab("exam")}>
            <span className="nav-ico"><Icon name="Exam" /></span><span>考试</span>
          </button>
          <button className={tab === "dash" ? "nav-item active" : "nav-item"} onClick={() => setTab("dash")}>
            <span className="nav-ico"><Icon name="Dash" /></span><span>仪表盘</span>
          </button>
          <button className={tab === "voice" ? "nav-item active" : "nav-item"} onClick={() => setTab("voice")}>
            <span className="nav-ico"><Icon name="Voice" /></span><span>语音</span>
          </button>
          <button className={tab === "settings" ? "nav-item active" : "nav-item"} onClick={() => setTab("settings")}>
            <span className="nav-ico"><Icon name="Settings" /></span><span>设置</span>
          </button>
        </nav>
        <div className="side-stats">
          <button className="stat stat-btn" onClick={() => { setTab("review"); startReview(); }}>
            <i>{counts?.due_review ?? "-"}</i><u>待复习</u>
          </button>
          <button className="stat stat-btn" onClick={() => setTab("review")}>
            <i>{counts?.new_remaining_today ?? "-"}</i><u>今日新卡余额</u>
          </button>
          <button className="stat stat-btn" onClick={goLex}>
            <i>{counts?.total_lexemes ?? "-"}</i><u>词元</u>
          </button>
          <button className="stat stat-btn" onClick={goLex}>
            <i>{counts?.total_cards ?? "-"}</i><u>卡片</u>
          </button>
        </div>
        <div className="side-foot">
          <div className="side-user">
            <span className="side-user-avatar">梯</span>
            <span>
              <b>我的语言资产</b>
              <span>数据全部在本地</span>
            </span>
            <span className="side-lvl">L{lvl}</span>
          </div>
          <div className="side-streak">
            <span className="flame"><Icon name="Streak" size={14} /></span>
            连胜 {streak} 天
            {/* 玻璃开关与连胜同行而不是另起一行：侧栏在 APP_SHOT 的窗口高度下本就已经
                接近溢出（连胜行只剩半截），再加一行只会把整块 footer 推出可视区 */}
            <button
              className={"side-glass" + (glassOn ? "" : " off")}
              onClick={toggleGlass}
              aria-pressed={!glassOn}
              aria-label={glassOn ? "关闭液态玻璃效果" : "开启液态玻璃效果"}
              title={glassOn
                ? "液态玻璃已开启。若机器卡顿或发烫，点这里关掉毛玻璃效果"
                : "液态玻璃已关闭。点这里恢复毛玻璃效果"}
            >
              <Icon name="Layers" size={13} />
              {glassOn ? "开" : "关"}
            </button>
          </div>
        </div>
      </aside>

      <main className="main" data-dir={pageDir}>
        <ErrorBoundary resetKey={tab}>
        {err && <div className="err">{err}</div>}

        {/* ============ 今日：唯一下一步（hero + 区块） ============ */}
        {tab === "today" && !assessView && (
          <div className="page today-page">
            {today ? (
              <>
                <div className="hero-panel">
                  <HeroCanvas paused={ttsStatus.phase === "speaking"} />
                  <div className="hero-greet">
                    <div>
                      <h2>{new Date().getHours() < 12 ? "早上好。" : new Date().getHours() < 18 ? "下午好。" : "晚上好。"}</h2>
                      <p>{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })} · 今天的下一步已经为你排好</p>
                    </div>
                    <span className="hero-streak">
                      <span className="flame"><Icon name="Streak" size={14} /></span>
                      连胜 {streak} 天
                    </span>
                  </div>
                  <button className="hero-action" onClick={() => { void todayPrimary(); }}>
                    <span>
                      {today.primary === "review" && (<><b>继续今日学习</b><span>复习 {today.queue} 张卡，约 {today.est_minutes} 分钟</span></>)}
                      {today.primary === "reading" && today.resume && (<><b>继续精读</b><span>《{today.resume.title}》· 回到第 {today.resume.pi + 1} 段</span></>)}
                      {today.primary === "feed" && (<><b>看看今日好文</b><span>挑一篇适合你水平的文章开始精读</span></>)}
                    </span>
                    <span className="ha-cta">开始 <Icon name="ArrowRight" size={14} /></span>
                  </button>
                </div>
                {(today.wrong_due > 0 || (today.shadow_due ?? 0) > 0 || (today.recycle_multi ?? 0) > 0) && (
                  <div className="today-remind">
                    {today.wrong_due > 0 && (
                      <button className="remind-chip" onClick={() => setTab("exam")}>
                        <Icon name="Exam" size={14} />错题到期 {today.wrong_due}
                      </button>
                    )}
                    {(today.shadow_due ?? 0) > 0 && (
                      <button className="remind-chip" onClick={openShadowReview}>
                        <Icon name="Play" size={14} />跟读续练 {today.shadow_due}
                      </button>
                    )}
                    {(today.recycle_multi ?? 0) > 0 && (
                      <button className="remind-chip" onClick={() => openRecycle("today")}>
                        <Icon name="Sparkles" size={14} />漏网词 {today.recycle_multi}
                      </button>
                    )}
                  </div>
                )}

                <div className="today-grid">
                  <div className="today-block">
                    <h4><span className="tb-ico"><Icon name="Sparkles" size={15} /></span>弱点训练 · 按重要度排序</h4>
                    {weaknesses.length === 0 && examWeak.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>暂无弱点记录，正常学习中会自动积累。</div>}
                    {examWeak.map((w) => (
                      <button key={"w" + w.id} className="tb-row" onClick={() => setExamDrill(w)}>
                        <span>
                          <b>{w.paper_title} · 第 {w.q_index + 1} 题</b>
                          <span style={{ display: "block" }}>{w.is_listening ? "听力错题 · 送跟读精听" : "错题 · 对话演练"}</span>
                        </span>
                        <span className="tb-go"><Icon name="ChevronRight" size={15} /></span>
                      </button>
                    ))}
                    {weaknesses.map((w) => (
                      <button key={w.asset_id} className="tb-row" onClick={() => {
                        setUsePrompt({ assetId: w.asset_id, canonical: w.canonical, kind: w.asset_kind });
                        setTab("chat");
                      }}>
                        <span>
                          <b>{w.canonical}</b>
                          <span style={{ display: "block" }}>{w.reasons.slice(0, 2).join(" · ") || w.gloss || "（无释义）"}</span>
                        </span>
                        <span className="tb-go"><Icon name="ChevronRight" size={15} /></span>
                      </button>
                    ))}
                  </div>

                  {drafts.length > 0 && (
                    <div className="today-block">
                      <h4><span className="tb-ico"><Icon name="Grad" size={15} /></span>待复盘</h4>
                      {drafts.map((d) => (
                        <button key={d.draft_key} className="tb-row" onClick={() => openDraftDebrief(d)}>
                          <span>
                            <b>{d.origin_kind === "reading" ? "文章复盘" : d.origin_kind === "conversation" ? "对话复盘" : "复盘"}</b>
                            <span style={{ display: "block" }}>{(() => { let cnt = 0; try { cnt = (JSON.parse(d.candidates_json) as unknown[]).length; } catch { /* 0 */ } return cnt; })()} 项收获待确认</span>
                          </span>
                          <span className="tb-go"><Icon name="ChevronRight" size={15} /></span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="muted">加载中…</div>
            )}
          </div>
        )}

        {/* ============ S11-b 漏网词回收 ============ */}
        {tab === "recycle" && (
          <div className="page">
            <div className="page-head">
              <button className="btn-mini recycle-back" onClick={() => setTab(recycleFrom)}>← 返回{recycleFrom === "lex" ? "词库" : "今日"}</button>
              <h2>漏网词回收</h2>
              <Seg ariaLabel="回收范围" value={recycleMultiOnly ? "multi" : "all"}
                onChange={(v) => {
                  const multi = v === "multi";
                  if (multi !== recycleMultiOnly) { setRecycleMultiOnly(multi); setRecycleItems([]); setRecycleSel(new Set()); void loadRecycle(multi); }
                }}
                options={[{ value: "multi", label: `多篇相遇${today?.recycle_multi ? `（${today.recycle_multi}）` : ""}` },
                          { value: "all", label: `全部${today?.recycle_total ? `（${today.recycle_total}）` : ""}` }]} />
              <button className="btn-mini" disabled={recycleBusy || recycleItems.length === 0}
                onClick={() => { setRecycleSel(new Set(recycleItems.map((x) => x.lemma))); }}>
                全选本页
              </button>
              <button className="btn-primary" disabled={recycleBusy || recycleSel.size === 0}
                onClick={() => void recycleAdd([...recycleSel])}>
                {recycleBusy ? "加入中…" : `加入词卡${recycleSel.size ? `（${recycleSel.size}）` : ""}`}
              </button>
            </div>
            <p className="muted recycle-hint">
              阅读中遇到、但还没进词卡的词；按考纲等级、学术词表（AWL）与常用度排序，多篇相遇的优先。
              勾选后批量加入复习（释义回忆 + 听音辨义 + 听写三卡）；之后在文章里再遇到，会自动补上带例句的语境卡。
            </p>
            {recycleMsg && <div className="recycle-msg">{recycleMsg}</div>}
            {recycleItems.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">✓</div>
                <h3>暂无漏网词</h3>
                <p>多读几篇文章，反复遇到却没建卡的词会汇集到这里。</p>
              </div>
            ) : (
              <>
                <div className="recycle-list">
                  {recycleItems.map((it) => {
                    const checked = recycleSel.has(it.lemma);
                    return (
                      <label key={it.lemma} className={"recycle-row" + (checked ? " sel" : "")}>
                        <input type="checkbox" checked={checked}
                          onChange={(e) => {
                            const n = new Set(recycleSel);
                            if (e.target.checked) n.add(it.lemma); else n.delete(it.lemma);
                            setRecycleSel(n);
                          }} />
                        <div className="rr-main">
                          <div className="rr-word">
                            <b>{it.lemma}</b>
                            {it.phonetic && <span className="rr-phon">/{it.phonetic.replace(/^\/+|\/+$/g, "")}/</span>}
                            <button type="button" className="speaker-xs" title={`听 ${it.lemma} 发音`}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); void speakWord(it.lemma); }}>🔈</button>
                            {it.level && <span className={"lvl-badge lv-" + it.level}>{LEVEL_LABEL[it.level]}</span>}
                            {it.awl === 1 && <span className="lvl-badge lv-awl">学术</span>}
                          </div>
                          <div className="rr-gloss">{it.gloss || "（词典暂无中文释义，可在阅读面板查看英英释义）"}</div>
                          <div className="rr-src">
                            相遇 {it.texts} 篇 · 共 {it.total} 次 · {it.sources.map((x) => x.title).join("、")}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {recycleItems.length < recycleTotal && (
                  <button className="btn-mini rr-more" onClick={() => void loadRecycle(recycleMultiOnly, true)}>
                    加载更多（剩余 {recycleTotal - recycleItems.length}）
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ============ 阅读：书库 ============ */}

        {tab === "read" && !readerMode && (
          <div
            className={"page" + (dragOver ? " dropper" : "")}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
            onDrop={onDrop}
          >
            <div className="page-head">
              <h2>书库</h2>
              {!composing && (
                <>
                  <button className="primary" onClick={() => setComposing(true)}>＋ 粘贴新文章</button>
                  <button onClick={() => fileInput.current?.click()} disabled={importing}>
                    {importing ? "导入中（图片 OCR 稍慢）…" : "导入文件（txt/md/epub/pdf/docx/图片）"}
                  </button>
                  <button className="ghost2" onClick={() => { setUrlOpen((v) => !v); setErr(""); }}>从 URL 抓取</button>
                  <input ref={fileInput} type="file" multiple hidden
                    accept=".txt,.md,.srt,.epub,.pdf,.docx,.png,.jpg,.jpeg,.bmp,.webp"
                    onChange={(e) => { if (e.target.files?.length) importFiles(e.target.files); e.target.value = ""; }} />
                </>
              )}
            </div>
            {urlOpen && (
              <div className="card url-box">
                <div className="url-row">
                  <input value={urlInput} placeholder="粘贴外网文章链接（https://…），抓取后可预览再入库"
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") fetchUrlPreview(); }} />
                  <button className="primary" disabled={urlBusy || !urlInput.trim()} onClick={fetchUrlPreview}>
                    {urlBusy ? "抓取中…" : "抓取正文"}
                  </button>
                  <button className="ghost2" onClick={() => { setUrlOpen(false); setUrlPreview(null); setUrlInput(""); }}>收起</button>
                </div>
                {urlPreview && (
                  <div className="url-preview">
                    <p className="url-meta"><b>{urlPreview.title}</b> · {urlPreview.paragraphs} 段 · {urlPreview.chars} 字符{urlPreview.truncated ? "（已截断）" : ""}</p>
                    <p className="url-sample">{urlPreview.text.slice(0, 500)}…</p>
                    <div className="row">
                      <button className="primary" disabled={busy} onClick={saveUrlPreview}>{busy ? "入库中…" : "确认入库并精读"}</button>
                      <button className="ghost2" onClick={() => setUrlPreview(null)}>放弃</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {importMsg && <div className="okmsg" style={{ marginBottom: 12 }}>{importMsg}</div>}
            {dragOver && <div className="drop-hint">松手即导入：txt / md / epub / pdf / docx / 图片（≤50MB·篇）</div>}

            {composing && (
              <div className="card compose">
                <textarea value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="粘贴英文文章（六级阅读 / 外刊 / 论文节选）…" autoFocus />
                <div className="row">
                  <button className="primary" disabled={busy || !text.trim()}
                    onClick={async () => { await annotateNow(text, { kind: "paste" }); setComposing(false); }}>
                    {busy ? "处理中…" : "标注并保存"}
                  </button>
                  <button className="ghost2" onClick={() => { setComposing(false); setText(""); }}>取消</button>
                  <button className="ghost2" onClick={() => setText(SAMPLE)}>填入示例</button>
                  <span className="muted">保存后自动分词标注，点生词即可建卡</span>
                </div>
              </div>
            )}

            {textTotalAll === 0 && !composing && (
              <div className="empty">
                <div className="empty-icon">梯</div>
                <h3>从一篇真实的英文文章开始</h3>
                <p>粘贴你正在读的六级阅读、外刊或论文节选——<br />系统会标注生词，点词建卡，词元和证据都会沉淀在这里。</p>
                <button className="primary" onClick={() => setComposing(true)}>＋ 粘贴第一篇文章</button>
              </div>
            )}

            {textTotalAll > 0 && (
              <>
                <div className="lib-bar">
                  <div className="chips">
                    <button className={srcFilter === "" ? "chip sel" : "chip"} onClick={() => setSrcFilter("")}>全部来源</button>
                    {(Object.keys(SOURCE_LABEL) as TextSourceKind[]).map((k) => (
                      <button key={k} className={srcFilter === k ? "chip sel" : "chip"} onClick={() => setSrcFilter(k)}>{SOURCE_LABEL[k]}</button>
                    ))}
                  </div>
                  <div className="lib-tools">
                    <div className="chips">
                      {["", ...CEFR_ORDER].map((c) => (
                        <button key={c || "all"} className={cefrFilter === c ? "chip lvl-chip sel" : "chip lvl-chip"} onClick={() => setCefrFilter(c)}>{c || "全部难度"}</button>
                      ))}
                    </div>
                    <select value={textSort} onChange={(e) => setTextSort(e.target.value as typeof textSort)} title="排序">
                      <option value="recent">最近导入</option>
                      <option value="words">词数多→少</option>
                      <option value="cefr">难度低→高</option>
                      <option value="rate">旧词率低→高</option>
                      <option value="lookups">查词多→少</option>
                    </select>
                  </div>
                </div>
                {texts.length === 0 && (
                  <div className="empty-mini">
                    没有符合筛选条件的文章
                    {(srcFilter || cefrFilter) && (
                      <button className="ghost2" style={{ marginLeft: 10 }}
                        onClick={() => { setSrcFilter(""); setCefrFilter(""); }}>清除筛选</button>
                    )}
                  </div>
                )}
                <div className="lib-grid">
                  {texts.map((t) => {
                    const kinds = Array.from(new Set(t.sources.map((s) => s.kind))) as TextSourceKind[];
                    const srcLabel = kinds.length ? kinds.map((k) => SOURCE_LABEL[k]).join(" · ") : "未记录来源";
                    return (
                      <div key={t.id} className="lib-card" role="button" tabIndex={0}
                        onClick={() => openSaved(t.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSaved(t.id); } }}>
                        <ProcCover seed={"lib-" + t.id + "-" + (t.title || "")} />
                        <span className="lib-title">{t.title || "无标题"}</span>
                        <span className="lib-badges">
                          <em className="src-badge">{srcLabel}</em>
                          {t.stats?.cefr && <em className="lvl">{t.stats.cefr}</em>}
                        </span>
                        <span className="lib-meta">
                          {t.stats?.words ? <span>{t.stats.words} 词</span> : <span>未统计</span>}
                          {t.stats?.words ? <span>旧词 {t.stats.rate}%</span> : null}
                          {t.stats?.awlRate ? <span>学术 {t.stats.awlRate}%</span> : null}
                          {t.lookups > 0 && <span className="lib-lookups">查词 {t.lookups}</span>}
                        </span>
                        <span className="lib-date">{fmtDate(t.created_at)}</span>
                        <button type="button" className="lib-del" title="删除文章"
                          onClick={(e) => { e.stopPropagation(); deleteTextCard(t); }}>×</button>
                      </div>
                    );
                  })}
                </div>
                {texts.length < textTotal && (
                  <div className="lib-more">
                    <button className="ghost2" onClick={() => setTextLimit((n) => n + 24)}>加载更多（剩余 {textTotal - texts.length}）</button>
                  </div>
                )}
              </>
            )}

            <div className="page-head" style={{ marginTop: 34 }}>
              <h2>素材库</h2>
              <span className="muted">原创考试风格仿写 + 公版/语料节选 · 真题有版权请自行导入</span>
            </div>
            <div className="chips">
              {["全部", ...Array.from(new Set(builtins.map((b) => b.genre)))].map((g) => (
                <button key={g} className={genre === g ? "chip sel" : "chip"} onClick={() => setGenre(g)}>{g}</button>
              ))}
            </div>
            <div className="mat-grid">
              {builtins
                .filter((b) => genre === "全部" || b.genre === genre)
                .map((b) => (
                  <button key={b.id} className="mat-card" onClick={() => openBuiltin(b.id)} disabled={busy}>
                    <span className="mat-title">{b.title}</span>
                    <span className="mat-sub">
                      <em className="g-badge">{b.genre}</em>
                      <em className="lvl">{b.level}</em>
                      <span>{b.words} 词</span>
                    </span>
                    <span className="mat-src">{b.source}</span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* ============ 阅读：阅读器 ============ */}
        {tab === "read" && readerMode && ann && (
          <div className="page">
            <div className="page-head reader-head">
              <button className="ghost2" onClick={backToLibrary}>← 书库</button>
              {learnedSummary && (
                <span className="muted">
                  本文已学 <b>{learnedSummary.words}</b> 词
                  {((learnedSummary.assets.chunk || 0) + (learnedSummary.assets.grammar || 0) +
                    (learnedSummary.assets.pronunciation || 0) + (learnedSummary.assets.concept || 0)) > 0 ? (
                    <> · <b>{
                      (learnedSummary.assets.chunk || 0) + (learnedSummary.assets.grammar || 0) +
                      (learnedSummary.assets.pronunciation || 0) + (learnedSummary.assets.concept || 0)
                    }</b> 项资产</>
                  ) : null}
                  {learnedSummary.shadow_pass > 0 ? <> · <b>{learnedSummary.shadow_pass}</b> 句跟读通过</> : null}
                </span>
              )}
              <button className="ghost2" title="把本文查过但还没建卡的词批量加入复习"
                onClick={() => { void openTextDebrief(ann!.text_id); }}>复盘本文</button>
              {ann.stats && (
                <span className="muted">
                  {ann.stats.words} 词 · 旧词重现 <b className="resurface-n">{ann.stats.learnedTokens}</b>（{ann.stats.rate}%）
                  {ann.stats.awlTokens ? <> · 学术词 <b className="awl-n">{ann.stats.awlTokens}</b>（{ann.stats.awlRate}%）</> : null} · 点生词建卡
                </span>
              )}
              <div className="legend">
                <span><i className="dot d-mwe" />短语</span>
                <span><i className="dot d-learned" />已学重现</span>
                <span><i className="dot d-awl" />学术AWL</span>
                <span><i className="dot d-miss" />未收录</span>
                <span><i className="dot d-cap" />专名</span>
              </div>
              <button
                className={transOn ? "primary" : ""}
                title={transOn ? "关闭中文对照" : "每段英文下方显示对应中文译文（内置译文或离线机翻）"}
                onClick={() => toggleTrans(!transOn)}>
                对照译文 {transOn ? "开" : "关"}
              </button>
            </div>
            {(mtBusy || mtErr) && (
              <div className="mt-banner">
                {mtBusy && (
                  <>
                    <span className="mt-msg">{mtBusy.msg}… {mtBusy.pct}%</span>
                    <span className="mt-bar"><i style={{ width: mtBusy.pct + "%" }} /></span>
                    {mtBusy.phase === "download" && (
                      <button className="ghost" onClick={() => { api.modelCancel(translator.modelId); }}>取消下载</button>
                    )}
                  </>
                )}
                {mtErr && (
                  <>
                    <span className="mt-err">离线翻译失败：{mtErr}</span>
                    <button className="ghost" onClick={() => toggleTrans(true)}>重试</button>
                  </>
                )}
              </div>
            )}
            {resumeNotice && <div className="resume-toast">{resumeNotice}</div>}
            <div className="reader" ref={readerRef} onMouseUp={() => {
              const sel = window.getSelection();
              const t = (sel?.toString() ?? "").trim();
              // 端点信息：所在英文段 data-pi，以及是否落在中文 .zh-para
              const infoOf = (node: Node | null) => {
                const el = (node?.nodeType === 3 ? node.parentElement : node) as HTMLElement | null;
                return { pi: el?.closest("p[data-pi]")?.getAttribute("data-pi") ?? null, inZh: !!el?.closest(".zh-para") };
              };
              const a = infoOf(sel?.anchorNode ?? null), f = infoOf(sel?.focusNode ?? null);
              // 中文/中英混合选区不进英文跟读台：直接清空，不展示浮动条
              if (!t || isChineseSelection(a.inZh, f.inZh)) { setSelText(""); setReadGrammar(null); setSelTrans(null); return; }
              setSelText(t);
              if (!trans) { setSelTrans(null); return; }
              // 选区必须落在同一个英文段落（anchor/focus 同 data-pi），跨段/反选不给译文
              const piStr = sameParagraph(a.pi, f.pi);
              if (piStr == null) { setSelTrans(null); return; }
              const para = trans[Number(piStr)];
              if (!para) { setSelTrans(null); return; }
              // 可靠匹配：整段选区须是某句英文的连续子串（弃首词包含，避免 the/a 误配）；找不到只展示选中原文
              const idx = pickPairIndex(para.pairs, t);
              setSelTrans(idx >= 0 ? { en: para.pairs[idx][0], zh: para.pairs[idx][1] } : null);
            }}>
              {(() => {
                const paras: Token[][] = [[]];
                for (const tk of ann.tokens) {
                  if (tk.label === "punct" && tk.text.includes("\n")) {
                    if (paras[paras.length - 1].length) paras.push([]);
                    continue;
                  }
                  paras[paras.length - 1].push(tk);
                }
                while (paras.length && !paras[paras.length - 1].length) paras.pop();
                return paras.map((ptoks, pi) => {
                  const groups = [];
                  let cur = [];
                  for (const tk of ptoks) {
                    cur.push(tk);
                    if (tk.label === "punct" && /[.!?]/.test(tk.text)) {
                      groups.push(cur); cur = [];
                    }
                  }
                  if (cur.length) groups.push(cur);
                  return (
                  <p key={pi} data-pi={pi} className="rpara">
                    {groups.map((gtoks, gi) => {
                      const gtext = gtoks.map((tk) => tk.text).join("").replace(/\s+/g, " ").trim();
                      const passed = shadowPassMap[gtext];
                      return (
                        <span key={gi} className="sent-g">
                          {gtoks.map((tk) =>
                            tk.label === "punct" ? (
                              <span key={tk.i} className="tkp">{tk.text}</span>
                            ) : (
                              <span key={tk.i}
                                className={`tk ${LABEL_CLASS[tk.label] ?? ""}${tk.learned ? " learned" : ""}${tk.awl ? " awl" : ""} clickable`}
                                onClick={() => lookup(tk)} title={tk.awl ? `AWL 学术词 · 子表 ${tk.awl}` + (tk.learned ? " · 已学" : "") : tk.learned ? "已学 · " + tk.label : tk.label}>
                                {tk.text}
                              </span>
                            )
                          )}
                          {passed && <i className="shadow-pass" title="已跟读通过">✓</i>}
                        </span>
                      );
                    })}
                    {transOn && trans && trans[pi] && trans[pi].zh && (
                      <span className="zh-para">{mt && <i className="mt-tag">机翻参考</i>}{trans[pi].zh}</span>
                    )}
                  </p>
                  );
                });
              })()}
            </div>
            {(selTrans || selText) && (
              <div className="trans-strip">
                {selText && (
                  <>
                    <span className="lbl">选中原文</span>
                    <div className="strip-en">{selText}</div>
                  </>
                )}
                {selTrans && (
                  <>
                    <span className="lbl">参考译文</span>
                    <div className="strip-zh">{selTrans.zh}</div>
                  </>
                )}
                <button className="primary" onClick={() => sendToShadow(selText, { textId: ann?.text_id })}>送跟读 →</button>
                <button className="ghost" onClick={() => setCapSel({ text: selText, zh: selTrans?.zh })}>转为练习</button>
                <button className="ghost" onClick={() => { void openReadGrammar(); }}>
                  {readGrammarBusy ? "分析中…" : "深度语法分析"}
                </button>
                <button className="ghost" onClick={() => {
                  setSelTrans(null); setSelText(""); setReadGrammar(null); setReadGrammarMsg("");
                }}>关闭</button>
                {readGrammarMsg && <em className="err-text">{readGrammarMsg}</em>}
              </div>
            )}
            {readGrammar && selText && ann && (
              <GrammarDiagnosisPanel
                source={{
                  originKind: "reading", originRef: String(ann.text_id),
                  title: texts.find((t) => t.id === ann.text_id)?.title || "阅读文章",
                }}
                text={selText}
                analysis={readGrammar}
                onClose={() => setReadGrammar(null)}
              />
            )}
          </div>
        )}

        {/* ============ 每日好文（S4） ============ */}
        {tab === "feed" && (
          <FeedPage
            onImported={async (id) => {
              setTab("read");
              await openSaved(id);
              refreshTexts();
            }}
          />
        )}

        {/* ============ 看板 ============ */}
        {tab === "dash" && !assessView && <DashPage onAssess={() => setAssessView(true)} />}
        {assessView && <AssessPage onExit={() => setAssessView(false)} onDone={() => { setCelebrate("assess-" + Date.now()); void refreshToday(); }} />}
        {celebrate && <Celebrate seed={celebrate} />}
        {tab === "shadow" && <ShadowPage send={shadowSend} reviewNonce={shadowReviewNonce} onPracticed={refreshToday} />}
        {tab === "voice" && <VoicePage />}
        {tab === "call" && <VoiceCallPage onOpenSettings={() => setTab("settings")} />}
        {tab === "settings" && <SettingsPanel />}
        {tab === "chat" && <ConversationPage
          onOpenSettings={() => setTab("settings")}
  onSendShadow={(t, opts) => sendToShadow(t, opts)}
  usePrompt={usePrompt}
  onPromptConsumed={() => setUsePrompt(null)}
  examDrill={examDrill}
  onExamDrillConsumed={() => setExamDrill(null)}
 />}

        {/* ============ 考纲牌组 ============ */}
        {tab === "syl" && <SyllabusPage onPickWord={lookupWord} />}

        {/* ============ 考试（V3） ============ */}
        {tab === "exam" && <ExamPage
          onCardsChanged={refreshCounts}
          onSendShadow={(t) => sendToShadow(t)}
          onConversationDrill={(item) => { setExamDrill(item); setTab("chat"); }}
        />}

        {tab === "lex" && (
          <div className="page">
            <div className="page-head">
              <h2>词库</h2>
              <button className="btn-mini recycle-entry" onClick={() => openRecycle("lex")}
                title="阅读中反复遇到、但还没建卡的词">
                漏网词{today && today.recycle_multi > 0 ? ` · ${today.recycle_multi}` : ""}
              </button>
              <span className="lex-count">{lexTotal} 个词元</span>
            </div>
            <div className="lex-toolbar">
              <input className="syl-search" style={{ flex: "1 1 220px" }} value={lexQ} onChange={(e) => setLexQ(e.target.value)} placeholder="搜索词元或释义…" />
              <Seg ariaLabel="词库排序" value={lexSort} onChange={setLexSort}
                options={([["created", "最新"], ["lapses", "遗忘优先"], ["encounters", "相遇次数"], ["level", "等级"]] as [LexSort, string][]).map(([v, label]) => ({ value: v, label }))} />
              <Seg ariaLabel="分组方式" value={lexGroup} onChange={setLexGroup}
                options={([["date", "按日期"], ["source", "按来源"]] as ["date" | "source", string][]).map(([v, label]) => ({ value: v, label }))} />
              <Seg ariaLabel="词库视图" value={lexView} onChange={setLexView}
                options={[{ value: "graph", label: "星云" }, { value: "list", label: "列表" }]} />
            </div>
            {lexView === "graph" && (
              <div className="card" style={{ padding: "10px 14px", marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input className="syl-search" style={{ flex: 1 }} value={addQ}
                    onChange={(e) => setAddQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void addWordToCards(); }}
                    placeholder="搜索任意词并加入复习（如 serendipity）…" />
                  <button className="btn-primary" disabled={addBusy || !addQ.trim()} onClick={() => { void addWordToCards(); }}>
                    <Icon name="Plus" size={15} />加入词卡
                  </button>
                </div>
                {addMsg && <div style={{ fontSize: 12, color: addMsg.startsWith("已") ? "var(--ok)" : "var(--red-pen)", marginTop: 8 }}>{addMsg}</div>}
              </div>
            )}
            {lexView === "graph" ? (
              <div className="card" style={{ padding: 8 }}>
                <LexGraph
                  center={graphCenter}
                  learned={lexLearnedSet}
                  onPick={pickGraphCenter}
                />
                <div className="muted" style={{ fontSize: 11.5, padding: "8px 10px 2px", textAlign: "center" }}>
                  点击星点切换中心词 · 实心=已在词库 · 红环=有遗忘记录 · 色相=考纲等级
                </div>
              </div>
            ) : lexemes.length === 0 ? (
              lexQ ? <p className="muted">没有匹配「{lexQ}」的词元</p> : (
                <div className="empty">
                  <div className="empty-icon">词</div>
                  <h3>还没有词元</h3>
                  <p>在阅读页点生词建卡，或在考纲页加入复习，词元会沉淀在这里。</p>
                </div>
              )
            ) : (
              (() => {
                const groups: { label: string; items: LexemeInfo[] }[] = [];
                if (lexGroup === "source") {
                  const reading = lexemes.filter((l) => l.has_reading === 1);
                  const syllabus = lexemes.filter((l) => l.has_reading === 0);
                  if (reading.length) groups.push({ label: `阅读挖矿 · ${reading.length}`, items: reading });
                  if (syllabus.length) groups.push({ label: `词表收录 · ${syllabus.length}`, items: syllabus });
                } else {
                  const map = new Map<string, LexemeInfo[]>();
                  const today = new Date();
                  const yd = new Date(Date.now() - 86_400_000);
                  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
                  for (const l of lexemes) {
                    const d = new Date(l.created_at);
                    const label = d.toDateString() === today.toDateString() ? "今天"
                      : d.toDateString() === yd.toDateString() ? "昨天" : fmt(d);
                    if (!map.has(label)) map.set(label, []);
                    map.get(label)!.push(l);
                  }
                  for (const [label, items] of map) groups.push({ label, items });
                }
                return groups.map((g) => (
                  <div key={g.label} style={{ marginBottom: 22 }}>
                    <div className="date-head">{g.label}</div>
                    <div className="list">
                      {g.items.map((l) => (
                        <div key={l.id}>
                          <div className="list-item clickable" onClick={() => openLex(l.id)}
                            title="点击查看卡片详情">
                            <span className="li-title">{l.lemma}</span>
                            {l.level && <span className={"lvl-badge lv-" + l.level}>{LEVEL_LABEL[l.level]}</span>}
                            <span className="li-sense">{(l.sense || "").slice(0, 40) || "—"}</span>
                            <span className="li-date lex-meta">
                              {l.lapses > 0 && <em className="m-lapse" title="复习时评「重来」的累计次数">忘 {l.lapses}</em>}
                              {l.encounters > 0 && <em title="在多少篇文章里相遇过">相遇 {l.encounters} 篇</em>}
                              <em>{l.cards} 卡{Number(l.due) > 0 ? ` · 到期 ${l.due}` : ""}</em>
                            </span>
                            <span className="dot-meter lex-dots" title={`累计遗忘 ${l.lapses} 次`}
                              aria-label={`累计遗忘 ${l.lapses} 次`}>
                              {[0, 1, 2].map((i) => <i key={i} className={l.lapses > i ? (l.lapses > 1 ? "bad" : "mid") : ""} />)}
                            </span>
                          </div>
                          {lexDetail?.id === l.id && (
                            <>
                            <div className="drawer-mask" onClick={() => setLexDetail(null)} />
                            <div className="lex-detail drawer-right" role="dialog" aria-label={`词元 ${lexDetail.lemma} 详情`}>
                              <div className="drawer-head">
                                <h3>{lexDetail.lemma}</h3>
                                <button className="gbtn" style={{ marginLeft: "auto" }} aria-label="关闭"
                                  onClick={(e) => { e.stopPropagation(); setLexDetail(null); }}><Icon name="X" size={16} /></button>
                              </div>
                              <div className="drawer-body">
                              <div className="lex-sum">
                                <button className="gbtn speaker-sm" title="播放发音" aria-label="播放发音"
                                  onClick={(e) => { e.stopPropagation(); speak(lexDetail.lemma); }}><Icon name="Speaker" size={17} /></button>
                                {lexDetail.level && <span className={"lvl-badge lv-" + lexDetail.level}>{LEVEL_LABEL[lexDetail.level]}</span>}
                                <em>累计遗忘 {lexDetail.lapses} 次</em>
                                <em>在 {lexDetail.encounters} 篇文章中相遇</em>
                                <em>{lexDetail.notes.some((n) => n.source === "reading") ? "来源：阅读挖矿" : "来源：词表收录"}</em>
                              </div>
                              {lexDetail.notes.map((n) => (
                                <div key={n.id} className="lex-note">
                                  {n.source === "syllabus" ? (
                                    <p className="lex-sentence muted">
                                      <span className="lbl">词表收录</span>{n.context_sentence}
                                    </p>
                                  ) : (
                                    <>
                                      <p className="lex-sentence">
                                        <span className="lbl">例句{n.text_title ? ` · 《${n.text_title}》` : ""}</span>
                                        {n.context_sentence}
                                      </p>
                                      {n.zh && <p className="lex-zh"><span className="lbl">译文</span>{n.zh}</p>}
                                      <button className="ghost2 lex-jump"
                                        onClick={() => jumpToText(n.text_id!, lexDetail.lemma, n.context_sentence)}>
                                        ↗ 查看原文
                                      </button>
                                    </>
                                  )}
                                  <div className="lex-cards">
                                    {n.cards.map((c) => (
                                      <span key={c.id} className={"card-chip" + (c.due <= Date.now() && c.state !== 0 ? " due" : "")}>
                                        {typeName(c.card_type)} · {fmtDue(c.state, c.due)}{c.lapses > 0 ? ` · 忘 ${c.lapses}` : ""}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              {lexDetail.related && lexDetail.related.family.length > 0 && (
                                <p className="orig">
                                  <span className="lbl">同根</span>
                                  {relatedChips(lexDetail.related.family)}
                                </p>
                              )}
                              {lexDetail.related && lexDetail.related.synonyms.length > 0 && (
                                <p className="orig">
                                  <span className="lbl">近义</span>
                                  {relatedChips(lexDetail.related.synonyms)}
                                </p>
                              )}
                              <button className="btn-primary" style={{ marginTop: 10 }}
                                onClick={() => { setTab("review"); startReview(); setLexDetail(null); }}>
                                去复习
                              </button>
                              </div>
                            </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()
            )}
            {lexemes.length < lexTotal && (
              <button className="primary" style={{ marginTop: 14 }} disabled={lexLoading}
                onClick={() => loadLex(lexQ, lexOffset + 100, true, lexSort)}>
                {lexLoading ? "加载中…" : `加载更多（还剩 ${lexTotal - lexemes.length}）`}
              </button>
            )}
          </div>
        )}

        {/* ============ 复习 ============ */}
        {tab === "review" && (
          <div className="page">
            {/* v2.1：原先页头与空态里各有一个「开始复习」，两者指向同一件事，
                用户会犹豫点哪个。改为只在真正有队列时于页头出现。 */}
            <div className="page-head">
              <h2>复习</h2>
              {queue.length > 0 && <button className="primary" onClick={startReview}>开始复习</button>}
            </div>

            {!card && (
              queueTotal > 0 ? (
                <div className="page review-done">
                  <EmptyState
                    seed={"review-done-" + queueTotal}
                    text={`本轮完成 ${queueTotal} 张。卡片会按遗忘曲线再次回到这里。`}
                    action={<button className="btn-primary" onClick={() => void startReview()}>再来一轮</button>}
                  />
                  {lastResult && <p className="muted rc-next" style={{ textAlign: "center" }}>最近一张：{lastResult}</p>}
                </div>
              ) : (
                <>
                  {/* v2.1：原文案「今天没有到期的卡片。待复习 1 · 今日还可学新卡 12」自我否定——
                      根因是把两个口径塞进一句：due_review 是「今日到期数」，queue 是「本轮队列」。
                      改为先说结论，再分行给可核对的数字。 */}
                  <EmptyState
                    seed="review-empty"
                    text={counts && counts.due_review > 0
                      ? "本轮队列已清空。下面是接下来可练的量。"
                      : "今天没有到期的卡片。"}
                    action={counts && counts.due_review > 0
                      ? <button className="btn-primary" onClick={() => void startReview()}>开始复习</button>
                      : <button className="ghost2" onClick={() => setTab("read")}>去阅读建卡</button>}
                  />
                  {counts && (
                    <div className="review-next">
                      <div className="rn-cell"><b>{counts.due_review}</b><span>今日到期</span></div>
                      <div className="rn-cell"><b>{counts.new_remaining_today}</b><span>今日新卡</span></div>
                      <div className="rn-cell"><b>{counts.total_lexemes}</b><span>词元总数</span></div>
                    </div>
                  )}
                </>
              )
            )}

            {card && (
              <div className="cardbox review-card glass">
                <div className="review-head">
                  <span className={`kind ${card.card_type}`}>
                    {card.card_type === "cloze" ? "挖空"
                      : card.card_type === "recall" ? "释义 → 词"
                      : card.card_type === "l_recog" ? "听音辨义"
                      : card.card_type === "spelling" ? "听音拼写"
                      : card.card_type === "note_translate" ? "翻译"
                      : card.card_type === "chunk_recall" ? "词块"
                      : card.card_type === "chunk_cloze" ? "词块填空"
                      : card.card_type === "grammar_pattern" ? "语法"
                      : card.card_type === "pron_perception" ? "发音听辨"
                      : card.card_type === "concept_recall" ? "考点"
                      : card.card_type === "concept" ? "概念" : "认读"}
                  </span>
                  <span className="rh-right">
                    <span className="rh-count tabular">{Math.min(done + 1, queueTotal)} / {queueTotal}</span>
                    <button className="gbtn" title="退出本轮复习" aria-label="退出本轮复习"
                      onClick={() => { setQueue([]); setShowBack(false); setChecked(null); }}><Icon name="X" size={16} /></button>
                  </span>
                </div>
                <div className="prog-rail" role="progressbar" aria-valuemin={0} aria-valuemax={queueTotal} aria-valuenow={done}>
                  <i style={{ width: `${queueTotal ? (done / queueTotal) * 100 : 0}%` }} />
                </div>

                {card.card_type === "note_translate" ? (
                  <TranslateJudge
                    sourceEn={card.full || card.sentence}
                    referenceZh={card.reference || ""}
                    onRate={(r) => void rate(r)} />
                ) : (card.card_type === "l_recog" || card.card_type === "spelling"
                  || card.card_type === "pron_perception") ? (
                  <div className="listen-front">
                    <button className="gbtn gbtn-lg speaker" onClick={() => speak(card.word)} title="再听一遍（空格）" aria-label="播放发音"><Icon name="Speaker" size={30} /></button>
                    <p className="muted">
                      {card.card_type === "l_recog" ? "听发音，选出正确释义"
                        : card.card_type === "spelling" ? "听发音，拼写这个单词"
                        : "听发音，注意这个片段怎么读"}
                      {ttsAvailable() ? "" : "（当前系统无可用语音引擎）"}
                    </p>
                  </div>
                ) : (
                  <p className="sentence">
                    {/* r_recog（认读）也走这里：core 已把它改成「有语境句就挖空、
                        无语境句就只显示单词」，不再经过 Highlight 把答案摊开（#200）。 */}
                    {(card.card_type === "concept" || card.card_type === "cloze"
                      || card.card_type === "recall" || card.card_type === "chunk_recall"
                      || card.card_type === "chunk_cloze" || card.card_type === "grammar_pattern"
                      || card.card_type === "concept_recall" || card.card_type === "r_recog")
                      ? card.sentence
                      : <Highlight sentence={card.sentence} word={card.word} />}
                  </p>
                )}
                {/* 词块正面就能写：之前只在翻面后有输入，等于「无处可写」——
                    而这个词块资产本来就是从对话沉淀的，zh_intent 常为空（#200）。 */}
                {card.card_type === "chunk_recall" && chunkRef === null && checked === null && (
                  <div className="cloze-input">
                    <input autoFocus value={guess} onChange={(e) => setGuess(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") checkChunk(); }}
                      placeholder="写出这句英文的中文意思…" />
                    <button className="primary" onClick={checkChunk}>核验（回车）</button>
                  </div>
                )}

                {/* 词块填空缺例句：正面就是完整答案，怎么答都是「对」。
                    与其让人白答，不如说清缺什么（#200）。 */}
                {card.card_type === "chunk_cloze" && card.noExample && (
                  <p className="muted">这条词块还没配例句，挖不出空格。可以先跳过，
                    在跟读台或复盘里重新沉淀一次（划词选句会带上例句与参考译文）。</p>
                )}

                {card.card_type === "cloze" && card.clozeMiss && (
                  <p className="muted">（原句中未找到该词形，直接看答案即可）</p>
                )}

                {((card.card_type === "cloze" && !card.clozeMiss) || card.card_type === "spelling") && checked === null && (
                  <div className="cloze-input">
                    <input autoFocus value={guess} onChange={(e) => setGuess(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") checkCloze(); }}
                      placeholder={card.card_type === "spelling" ? "拼写听到的单词…" : "填入空格处的单词…"} />
                    <button className="primary" onClick={checkCloze}>检查（回车）</button>
                  </div>
                )}

                {(card.card_type === "recall" || card.card_type === "l_recog"
                  || card.card_type === "r_recog") && checked === null && card.choices && (
                  <div className="choices">
                    {card.choices.map((c: string) => (
                      <button key={c} className="choice"
                        onClick={() => { setChosen(c); setChecked(c === (card.correctChoice ?? card.sense)); setShowBack(true); }}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                {/* 翻译卡不走「翻面看答案」：它自己就是逐层揭示（提交对照→差异→云端），
                    再给一个「显示答案」按钮会让人直接跳过批改看到参考译文。 */}
                {!showBack && !pendingInput && card.card_type !== "note_translate"
                  && !(card.card_type === "chunk_recall" && chunkRef === null) && (
                  <button className="primary big" onClick={() => setShowBack(true)}>
                    {card.card_type === "recall" ? "显示单词（空格）" : "显示答案（空格）"}
                  </button>
                )}

                {showBack && card.card_type !== "note_translate" && (
                  <>
                    {checked !== null && (
                      <div className={checked ? "verdict ok" : "verdict bad"}>
                        {(card.card_type === "recall" || card.card_type === "l_recog")
                          ? (checked ? "✓ 选对了" : `✗ 你选了「${chosen}」· 正确：${card.correctChoice ?? card.sense}`)
                          : (checked ? "✓ 填对了" : `✗ 你填「${guess || "空"}」· 正确答案：${card.answer}`)}
                      </div>
                    )}
                    <div className="back">
                      {card.card_type === "concept" ? (
                        <div className="concept-back">
                          <div className="back-word"><b className="hw">错题概念卡</b></div>
                          {card.full.split("\n").filter(Boolean).map((line, i) => <p key={i} className="concept-line">{line}</p>)}
                        </div>
                      ) : card.asset_id ? (
                        <div>
                          <div className="back-word">
                            <b className="hw">{card.word}</b>
                            {card.asset_kind === "pronunciation" && Boolean(card.payload?.ipa) &&
                              <span className="phon">/{String(card.payload?.ipa)}/</span>}
                          </div>
                          {/* chunk_recall 背��：有中文意图就直接核验；没有就给输入框让用户自己写——
                              词块资产多��从对话沉淀，zh_intent 本就常为空（#200）。
                              「（无释义）」那种占位等于既没处写也没法自检。 */}
                          {card.card_type === "chunk_recall" && chunkRef !== null && (
                            <p className="orig"><span className="lbl">你写的</span>{chunkRef}</p>
                          )}
                          {card.card_type === "chunk_recall" && (
                            String(card.payload?.zh_intent || card.sense)
                              ? <p className="sense-p">{String(card.payload?.zh_intent || card.sense)}</p>
                              : <p className="muted">（这条词块没有中文意图，只有你自己的译文可对照——可以点「再来一次」把它加为资产并补上释义）</p>
                          )}
                          {card.card_type === "chunk_cloze" && (
                            <>
                              <p className="sense-p">{card.sense || "（无释义）"}</p>
                              <p className="orig"><span className="lbl">例句</span>{card.full}</p>
                            </>
                          )}
                          {card.card_type === "grammar_pattern" && (
                            <>
                              <p className="sense-p"><b>答案：</b>{card.answer || "（未填答案）"}</p>
                              {String(card.payload?.explanation || card.sense || "") &&
                                <p className="orig">{String(card.payload?.explanation || card.sense)}</p>}
                            </>
                          )}
                          {card.card_type === "pron_perception" && (
                            <p className="sense-p">问题类型：{String(card.payload?.problem_type ?? "")}
                              {card.sense ? " · " + card.sense : ""}</p>
                          )}
                          {card.card_type === "concept_recall" && (
                            <p className="sense-p">{String(card.payload?.strategy || card.sense || "（无说明）")}</p>
                          )}
                          {card.card_type === "chunk_recall" && card.full && card.full !== card.word &&
                            <p className="orig"><span className="lbl">例句</span>{card.full}</p>}
                          <div className="use-zone">
                            {useCounts && (
                              <p className="use-stats">
                                自然用出 <b>{useCounts.used_spontaneously}</b> ·
                                引导用出 {useCounts.used_prompted} ·
                                纠正后 {useCounts.used_after_correction}
                                {useCounts.recognized > 0 ? <> · 识别 {useCounts.recognized}</> : null}
                              </p>
                            )}
                            <button className="ghost2 use-again" title="跳到对话，用这个表达造一句（记为引导用出）"
                              onClick={() => {
                                setUsePrompt({
                                  assetId: card.asset_id!, canonical: card.word,
                                  kind: card.asset_kind || "chunk",
                                });
                                setTab("chat");
                              }}>再用一次（对话造句）</button>
                          </div>
                        </div>
                      ) : (
                        <>
                        <div className="back-word">
                          <b className="hw">{card.word}</b>
                          {card.phonetic && <span className="phon">/{card.phonetic}/</span>}
                        </div>
                      <p className="sense-p">{card.sense || "（无释义）"}</p>
                      {card.definition && (
                        <div className="en-def">
                          <button className="en-def-toggle" onClick={() => setEnDefOpen((v) => !v)}>
                            英英释义（撤拐训练）{enDefOpen ? "收起" : "展开"}
                          </button>
                          {enDefOpen && (
                            <div className="en-def-body">
                              {card.definition.split("\\n").filter(Boolean).map((d, i) => <p key={i}>{d}</p>)}
                            </div>
                          )}
                        </div>
                      )}
                      <p className="orig">
                        <span className="lbl">例句</span>
                        <Highlight sentence={card.full} word={card.word} />
                      </p>
                      {card.text_id ? (
                        <p className="orig context-jump-row">
                          <button type="button" className="context-jump"
                            onClick={() => jumpToText(card.text_id!, card.word, card.full)}>
                            ↗ 回看原文语境
                          </button>
                        </p>
                      ) : null}
                      {(() => {
                        const ex = card.exchange;
                        if (!ex) return null;
                        const names: Record<string, string> = {
                          p: "过去式", d: "过去分词", i: "现在分词", "3": "三单",
                          s: "复数", r: "比较级", t: "最高级",
                        };
                        const kind = { current: "" as string };
                        const morphs: { k: string; v: string }[] = [];
                        for (const item of ex.split("/")) {
                          if (item.includes(":")) {
                            const [k, v] = item.split(":", 2);
                            kind.current = names[k] || k;
                            if (v) morphs.push({ k: kind.current, v });
                          } else if (item && kind.current) {
                            morphs.push({ k: kind.current, v: item });
                          }
                        }
                        if (!morphs.length) return null;
                        return (
                          <p className="orig">
                            <span className="lbl">词形</span>
                            {morphs.map((m, i) => <em key={i} className="morph">{m.k} {m.v}</em>)}
                          </p>
                        );
                      })()}
                      {related && related.family.length > 0 && (
                        <p className="orig">
                          <span className="lbl">同根</span>
                          {related.family.map((s) => (
                            <em key={s.word} className="syn"><b>{s.word}</b> {s.gloss}</em>
                          ))}
                        </p>
                      )}
                      {related && related.synonyms.length > 0 && (
                        <p className="orig">
                          <span className="lbl">近义</span>
                          {related.synonyms.map((s) => (
                            <em key={s.word} className="syn">
                              <b>{s.word}</b> {s.gloss}
                            </em>
                          ))}
                        </p>
                      )}
                      </>
                      )}
                    </div>
                    <div className="ratings grade-keys">
                      <button className="r1" onClick={() => void rate(1)}><span>重来</span><kbd className="kbd-hint">1</kbd></button>
                      <button className="r2" onClick={() => void rate(2)}><span>困难</span><kbd className="kbd-hint">2</kbd></button>
                      <button className="r3" onClick={() => void rate(3)}><span>良好</span><kbd className="kbd-hint">3</kbd></button>
                      <button className="r4" onClick={() => void rate(4)}><span>简单</span><kbd className="kbd-hint">4</kbd></button>
                    </div>
                  </>
                )}
                {lastResult && <div className="okmsg">{lastResult}</div>}
              </div>
            )}
          </div>
        )}

        {/* 查词面板：词典条目 */}
        {entry && (
          <aside className="panel" key={entryKey}>
            <div className="headword-line">
              <span className="headword">{entry.word}</span>
              {entry.phonetic && <span className="phonetic">/{entry.phonetic}/</span>}
              <button className="speaker-sm" title="播放发音" aria-label="播放发音"
                onClick={() => speak(entry.lemma || entry.word)}>🔊</button>
            </div>
            <div className="entry-meta">
              {entry.pos && <span>{entry.pos}</span>}
              {entry.tag && <span>{entry.tag}</span>}
              {entry.kind !== "proper" && entry.kind !== "number" && <span>BNC {entry.bnc}</span>}
              {entry.layers?.map((p) => (
                <em key={p.id} className="pack-badge" title={`来自领域词包：${p.name}`}>{p.name}</em>
              ))}
            </div>
            <div className="senses">
              {entry.cardable === false ? (
                entry.kind === "function" ? (
                  <div>
                    <div className="muted">功能词（冠词、介词、连词、代词等封闭词类），随用随会，不建卡。</div>
                    {entry.translation && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        {entry.translation.split("\\n").slice(0, 3).join("；")}
                      </div>
                    )}
                  </div>
                ) : <div className="muted">{entry.translation}</div>
              ) : senses.length === 0 ? (
                <div className="muted">（无释义）</div>
              ) : (
                senses.map((s: string, i: number) => (
                  <label key={i} className={i === senseIdx ? "sense sel" : "sense"}>
                    <input type="radio" name="sense" checked={i === senseIdx} onChange={() => setSenseIdx(i)} />
                    <span>{s}</span>
                  </label>
                ))
              )}
              {sensesAreEnglish && senses.length > 0 && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>英英释义（扩展词包，无中文）</div>
              )}
            </div>
            {entry.definition && !sensesAreEnglish && (
              <div className="en-def">
                <button className="en-def-toggle" onClick={() => setEnOpen((v) => !v)}>
                  英英释义（撤拐训练）{enOpen ? "收起" : "展开"}
                </button>
                {enOpen && (
                  <div className="en-def-body">
                    {entry.definition.split("\\n").filter(Boolean).map((d, i) => <p key={i}>{d}</p>)}
                  </div>
                )}
              </div>
            )}
            {entryRelated && entryRelated.family.length > 0 && (
              <p className="orig">
                <span className="lbl">同根</span>
                {relatedChips(entryRelated.family)}
              </p>
            )}
            {entryRelated && entryRelated.synonyms.length > 0 && (
              <p className="orig">
                <span className="lbl">近义</span>
                {relatedChips(entryRelated.synonyms)}
              </p>
            )}
            {entry.cardable !== false && entryKey.startsWith("t:") ? (
              <button className="primary" onClick={createCard} disabled={busy || senses.length === 0}>建卡（认读+挖空+回忆）</button>
            ) : entry.cardable !== false ? (
              <>
                <button className="primary" onClick={addToList} disabled={busy || senses.length === 0}>加入复习（释义→词）</button>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  {entryKey.startsWith("w:")
                    ? "拓展词/考纲词走词表收录：只生成「释义→词」卡；认读、挖空需要语境句，等你在阅读中遇到该词时自动补齐。"
                    : "词表收录只生成「释义→词」四选一卡；认读、挖空需要语境句，等你在阅读中遇到该词时自动补齐。"}
                </div>
              </>
            ) : null}
            {createMsg && <div className="okmsg">{createMsg}</div>}
            <button className="ghost" onClick={() => { setEntry(null); setEntryStart(0); setEntryKey(""); }}>关闭</button>
          </aside>
        )}
        <AssetCaptureSheet
          open={!!capSel}
          source={capSel ? {
            originKind: "reading",
            originRef: String(ann?.text_id ?? ""),
            title: "阅读文章",
            sentence: selText || capSel.text,
            referenceZh: capSel?.zh,
          } : null}
          initialText={capSel?.text ?? ""}
          onClose={() => setCapSel(null)}
          onWord={async (word, sentence) => api.createShadowNote({ word, sentence })}
        />
        </ErrorBoundary>
      </main>
      {debrief && (
          <DebriefPanel
            ctx={debrief.ctx}
            initial={debrief.initial}
            onClose={() => setDebrief(null)}
            onAfter={() => {
              api.debriefList().then(setDrafts).catch((e) => { console.error("[debrief] 草稿列表加载失败", e); });
              refreshCounts();
            }}
          />
        )}
      <UIHost />
    </div>
  );
}

