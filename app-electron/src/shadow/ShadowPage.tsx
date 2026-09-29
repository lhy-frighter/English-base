import { useEffect, useRef, useState } from "react";
import { SessionTracker } from "../learning-session";
import { asr } from "../asr/asr";
import { inference } from "../inference/coordinator";
import { speak, speakWord, stopSpeaking } from "../tts";
import { api } from "../api";
import { decodeToPcm16k } from "./audio";
import { alignRead, type AlignResult, type AlignOp } from "./align";
import { wordSpan, playWordClip, stopOwnClip, type Span } from "./clip";
import { saveClip, CURRENT_MODEL } from "../regression";
import type { ShadowDueItem, ShadowPracticeResult } from "../api";
import { AssetCaptureSheet } from "../components/AssetCaptureSheet";
import { Icon } from "../icons";
import { ProcCover } from "../ProcCover";
import { RingGauge } from "../components/ui";

function shHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const SAMPLE = "The quick brown fox jumps over the lazy dog while the morning light slowly fills the quiet street.";

type Phase = "idle" | "recording" | "working" | "done";
type PronTag = "segmental" | "weakform" | "rhythm";
interface InlinePick {
  idx: number;
  word: string;
  span: Span | null;
  pk: "miss" | "sub";
  tag: PronTag;
  reBusy: boolean;
  rePass: boolean | null;
  reMatch: number;
  saveBusy: boolean;
  saved: boolean;
  assetExisted: boolean;
}

// 句级流利度（参考指标，非发音评分）：卡顿 −12/处；语速低于 110wpm 或高于 200wpm 扣分
function fluencyScore(r: AlignResult): number {
  let s = 100 - r.gaps.length * 12;
  if (r.spokenWpm > 0 && r.spokenWpm < 110) s -= (110 - r.spokenWpm) * 0.4;
  if (r.spokenWpm > 200) s -= (r.spokenWpm - 200) * 0.5;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export default function ShadowPage({ send, reviewNonce = 0, onPracticed }: {
  send?: {
    text: string; nonce: number; textId?: number; title?: string;
    originKind?: string; originRef?: string;
  } | null;
  reviewNonce?: number;
  onPracticed?: () => void;
}) {
  const [target, setTarget] = useState(SAMPLE);
  const targetRef = useRef(target);
  targetRef.current = target;
  const [resultTarget, setResultTarget] = useState(""); // 本次比对/成卡冻结的目标句快照，防止事后编辑文本框造成例句错配
  const [phase, setPhase] = useState<Phase>("idle");
  const [res, setRes] = useState<AlignResult | null>(null);
  const [saidText, setSaidText] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [err, setErr] = useState("");
  // 问题词就地卡片（ADR-3：识别误差不自动成卡，必须用户回听/操作确认）
  const [pick, setPick] = useState<InlinePick | null>(null);
  const pcmRef = useRef<Float32Array | null>(null); // 本次录音的 16k PCM，供单词级切片回听
  const [added, setAdded] = useState<Set<string>>(new Set());
  const lastBlobRef = useRef<Blob | null>(null); // 本次录音 Blob，供存入回归集
  const [regSaved, setRegSaved] = useState(false);
  const [regBusy, setRegBusy] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef(""); // 始终持有最新 Blob URL，供卸载/换句时释放（避免闭包捕获初始空值）
  const nonceRef = useRef(0); // 练习观察证据的逐次 nonce（每次重录各一条）
  // S11-c：送来句子的来源文章（记录到 1/3/7 调度）；续练队列与进度
  const sourceRef = useRef<{
    textId?: number; title?: string;
    originKind?: string; originRef?: string;
  } | null>(null);
  const [reviewActive, setReviewActive] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<ShadowDueItem[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewMsg, setReviewMsg] = useState("");
  const [schedNote, setSchedNote] = useState("");
  const draftLoadedRef = useRef(false);
  const [capOpen, setCapOpen] = useState(false);
  const [capPrefill, setCapPrefill] = useState<import("../components/AssetCaptureSheet").CapturePrefill | null>(null);

  // 清空一次比对的全部产物（换句/送句/续练下一句共用）
  const resetRound = (newTarget?: string) => {
    setRes(null); setSaidText(""); setPhase("idle"); setErr(""); setSchedNote("");
    setPick(null); setAdded(new Set()); setResultTarget(""); setRegSaved(false);
    lastBlobRef.current = null; pcmRef.current = null;
    replaceAudioUrl(null);
    if (newTarget != null) setTarget(newTarget);
  };

  const persistDraft = (sent: string) => {
    const t = sent.trim();
    if (t) void api.resumePut("shadow", "shadow", { sentence: t }).catch(() => {});
  };

  // 撤销旧录音 URL 并换上新的（blob 为空表示仅清空）
  const replaceAudioUrl = (blob: Blob | null) => {
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = ""; }
    if (blob) { const u = URL.createObjectURL(blob); audioUrlRef.current = u; setAudioUrl(u); }
    else setAudioUrl("");
  };

  // S9-1 跟读会话：进入跟读台开始计时（仅前台可见），卸载关闭；每完成一次比对 amount+1
  const sessionRef = useRef<SessionTracker | null>(null);
  if (!sessionRef.current) sessionRef.current = new SessionTracker();
  useEffect(() => {
    const tr = sessionRef.current!;
    void tr.start("shadow", { refType: "shadow_page", refId: "shadow", titleSnapshot: "跟读台", unit: "sentences", amount: 0 });
    return () => { void tr.stop(); };
  }, []);

  useEffect(() => () => { // 卸载：停麦、落盘草稿并释放当前 Blob URL
    streamRef.current?.getTracks().forEach((t) => t.stop());
    persistDraft(targetRef.current);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  // 外部（阅读选区/听力字幕）送来目标句：预填并清掉上一次比对与录音
  useEffect(() => {
    if (!send) return;
    sourceRef.current = {
      textId: send.textId, title: send.title,
      originKind: send.originKind, originRef: send.originRef,
    };
    setReviewActive(false); setReviewQueue([]); setReviewIdx(0); setReviewMsg("");
    setTarget(send.text); resetRound(send.text);
    persistDraft(send.text);
  }, [send?.nonce]); // eslint-disable-line

  // S11-c shadow 断点续学：冷启动恢复上次未练完的目标句（送句/续练模式优先）
  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    api.resumeGet("shadow").then((r) => {
      const sent = r?.locator && typeof r.locator.sentence === "string" ? r.locator.sentence.trim() : "";
      if (sent && !send) { setTarget(sent); }
    }).catch(() => {});
  }, []);

  // 目标句草稿防抖落盘（卸载时再存一次）
  useEffect(() => {
    const t = setTimeout(() => persistDraft(target), 1500);
    return () => clearTimeout(t);
  }, [target]);

  // S11-c 今日页进入"跟读续练"：拉取到期句队列
  useEffect(() => {
    if (!reviewNonce) return;
    let cancelled = false;
    api.shadowDue(50).then((items) => {
      if (cancelled) return;
      if (!items.length) {
        setReviewActive(false); setReviewMsg("没有到期的续练句");
        return;
      }
      setReviewMsg("");
      setReviewQueue(items); setReviewIdx(0); setReviewActive(true);
      loadReviewItem(items, 0);
    }).catch((e) => setReviewMsg("续练加载失败：" + (e as Error).message));
    return () => { cancelled = true; };
  }, [reviewNonce]);

  const loadReviewItem = (items: ShadowDueItem[], idx: number) => {
    const it = items[idx];
    if (!it) {
      setReviewActive(false); setReviewMsg("今日续练完成 🎉");
      return;
    }
    sourceRef.current = it.textId != null ? { textId: it.textId, title: it.sourceTitle } : null;
    resetRound(it.sentence);
  };

  const reviewNext = () => {
    const next = reviewIdx + 1;
    setReviewIdx(next);
    if (next >= reviewQueue.length) {
      // 队列练完：回查是否有新到期（练习推进后旧句应已消失）
      api.shadowDue(50).then((more) => {
        if (more.length) { setReviewQueue(more); setReviewIdx(0); loadReviewItem(more, 0); }
        else { setReviewActive(false); setReviewMsg("今日续练完成 🎉"); onPracticed?.(); }
      }).catch(() => { setReviewActive(false); });
    } else loadReviewItem(reviewQueue, next);
  };

  const reviewDismiss = () => {
    const it = reviewQueue[reviewIdx];
    if (!it) return;
    void api.shadowDismiss(it.id).then(() => { onPracticed?.(); reviewNext(); });
  };

  const start = async () => {
    setErr(""); setRes(null); setPick(null); setRegSaved(false);
    pcmRef.current = null; stopOwnClip();
    const snap = target.trim();
    if (!snap) { setErr("先填要跟读的句子"); return; }
    setResultTarget(snap); // 冻结：后续对齐与成卡都用这份快照，文本框再改也不影响
    try {
      // 显式确保生产单例停在默认档位 base（回归面板评测可能加载过其它模型），避免"tiny 转写却标 base"
      await inference.acquire("asr");
      await asr.init("wasm", CURRENT_MODEL);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setPhase("working");
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          replaceAudioUrl(blob);
          lastBlobRef.current = blob; setRegSaved(false);
          const pcm = await decodeToPcm16k(blob);
          pcmRef.current = pcm;
          const r = await asr.transcribe(pcm);
          setSaidText(r.text);
          const aligned = alignRead(snap, r.words);
          setRes(aligned);
          sessionRef.current?.bumpAmount(1);
          setPhase("done");
          // S11-c：句子级 1/3/7 轻量复习（只提醒重练，不进 FSRS 卡池）
          api.shadowPractice({
            sentence: snap,
            textId: sourceRef.current?.textId ?? null,
            title: sourceRef.current?.title ?? "",
            similarity: Math.round(aligned.similarity * 100),
            originKind: sourceRef.current?.originKind || "reading",
            originRef: sourceRef.current?.originRef || "",
          }).then((pr: ShadowPracticeResult) => {
            const stepTxt = ["明天", "3 天后", "7 天后"];
            setSchedNote(pr.graduated
              ? "✓ 已跟读通过：1/3/7 全部完成，来源句已标记"
              : pr.isNew
                ? "已记入跟读续练：明天再练一次（之后 3 天、7 天）"
                : pr.advanced
                  ? `续练已推进：${stepTxt[pr.stage] ?? "稍后"}再练一次`
                  : "已记录本次练习（未到续练时间，不提前推进）");
            onPracticed?.();
          }).catch(() => {});
        } catch (e) { setErr("识别失败：" + (e as Error).message); setPhase("idle"); }
      };
      recRef.current = mr; mr.start(); setPhase("recording");
    } catch (e) { setErr("无法开始录音（检查麦克风权限）：" + (e as Error).message); setPhase("idle"); }
  };

  const stop = () => recRef.current?.stop();

  // 第 idx 个对齐词的回听区间（t0~t1+留白；t1 缺失用下一词起点收口）
  const spanOf = (idx: number): Span | null => {
    if (!res || !pcmRef.current) return null;
    const op = res.ops[idx];
    if (!op || op.kind === "miss" || op.t0 == null) return null;
    let nextT0: number | null = null;
    for (let k = idx + 1; k < res.ops.length; k++) {
      const o2 = res.ops[k];
      if (o2.kind !== "miss" && o2.t0 != null && o2.t0 > op.t0) { nextT0 = o2.t0; break; }
    }
    return wordSpan(op.t0, op.t1, nextT0, pcmRef.current.length / 16000);
  };

  // 只播自己录音里这个词的切片（不再从词位置一路播到句尾）
  const playOwn = (idx: number) => {
    const sp = spanOf(idx);
    if (!sp || !pcmRef.current) return;
    playSpan(sp);
  };

  // 三类播放互斥：自录切片开始前停 TTS、暂停整段录音条
  const playSpan = (sp: Span) => {
    if (!pcmRef.current) return;
    stopSpeaking(); audioRef.current?.pause();
    playWordClip(pcmRef.current, sp);
  };

  // 听模型读单个词（与自录切片互斥；整句示范在顶部）
  const modelSay = (word: string) => {
    stopOwnClip(); audioRef.current?.pause();
    speakWord(word);
  };

  // 点问题词（漏词/疑似替换）：再点一次关闭；打开就地卡片并回听切片。漏词无时间戳，不可回听
  const clickProblem = (idx: number) => {
    if (pick && pick.idx === idx) { setPick(null); return; }
    const op = res!.ops[idx] as Extract<AlignOp, { kind: "miss" | "sub" }>;
    const span = op.kind === "sub" ? spanOf(idx) : null;
    setPick({
      idx, word: op.ref, span, pk: op.kind,
      tag: op.kind === "sub" ? "segmental" : "weakform",
      reBusy: false, rePass: null, reMatch: 0,
      saveBusy: false, saved: false, assetExisted: false,
    });
    api.findAssetByCanonical("pronunciation", op.ref).then((aid) => {
      setPick((p) => (p && p.idx === idx ? { ...p, assetExisted: aid != null } : p));
    }).catch(() => {});
    if (span) playSpan(span);
  };

  const setPickTag = (tag: PronTag) =>
    setPick((p) => (p ? { ...p, tag } : p));

  // 「🎙 再读这个词」：录单词 → 即时复判；有资产时写 practice_observation，通过再写 improved
  const rerecordWord = async () => {
    if (!pick || pick.reBusy) return;
    const wordNow = pick.word;
    setPick((p) => (p ? { ...p, reBusy: true, rePass: null } : p));
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const ch: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) ch.push(e.data); };
      const blob = await new Promise<Blob>((resolve) => {
        mr.onstop = () => resolve(new Blob(ch, { type: mr.mimeType || "audio/webm" }));
        mr.start();
        setTimeout(() => { if (mr.state !== "inactive") mr.stop(); }, 3000); // 单词最多录 3s
      });
      stream.getTracks().forEach((t) => t.stop());
      const pcm = await decodeToPcm16k(blob);
      await inference.acquire("asr");
      await asr.init("wasm", CURRENT_MODEL);
      const r = await asr.transcribe(pcm);
      const mini = alignRead(wordNow, r.words);
      const pass = mini.hit > 0;
      const matchPct = Math.round(mini.similarity * 100);
      const existingId = await api.findAssetByCanonical("pronunciation", wordNow);
      const n = nonceRef.current++;
      if (existingId) {
        await api.addAssetEvidence({
          asset_id: existingId, dimension: "word_rerecord",
          result: "practice_observation", source_kind: "shadow", source_ref: "shadow",
          payload: { text_match: matchPct },
          idempotency_key: `shadow-rerecord-${shHash(wordNow)}-${n}`,
        });
        if (pass) {
          await api.addAssetEvidence({
            asset_id: existingId, dimension: "word_rerecord",
            result: "improved", source_kind: "shadow", source_ref: "shadow",
            payload: { text_match: matchPct },
            idempotency_key: `shadow-improved-${shHash(wordNow)}-${n}`,
          });
        }
      }
      setPick((p) => (p
        ? { ...p, reBusy: false, rePass: pass, reMatch: matchPct, assetExisted: existingId != null }
        : p));
    } catch (e) {
      setErr("再读识别失败：" + (e as Error).message);
      setPick((p) => (p ? { ...p, reBusy: false } : p));
    }
  };

  // 「存入复习」：用当前 tag 建发音资产（已有则复用，不重复建），听辨卡 + 产出卡，零表单
  const savePronAsset = async () => {
    if (!pick || pick.saveBusy || pick.saved) return;
    setPick((p) => (p ? { ...p, saveBusy: true } : p));
    try {
      let ipa = "";
      try {
        const ph = await api.phonetics([pick.word]);
        if (ph[0]) ipa = `/${ph[0]}/`;
      } catch { /* 音标留空 */ }
      let assetId: number;
      const existing = await api.findAssetByCanonical("pronunciation", pick.word);
      if (existing) {
        assetId = existing;
      } else {
        const r = await api.captureAsset({
          asset_kind: "pronunciation",
          canonical: pick.word,
          gloss: "",
          payload: { ipa, problem_type: pick.tag, perception: true },
          test_point: "",
          idempotency_key: `ui-shadow-pron-${shHash(pick.word)}-${pick.tag}`,
          encounter: {
            origin_kind: "shadow",
            origin_ref: "sh-" + shHash(resultTarget),
            title: "跟读台",
            sentence: resultTarget,
            locator: { word: pick.word, tag: pick.tag },
          },
        });
        assetId = r.asset_id;
      }
      await api.addPronProductionCard(assetId);
      setAdded((prev) => { const n = new Set(prev); n.add(pick.word.toLowerCase()); return n; });
      setPick((p) => (p ? { ...p, saveBusy: false, saved: true, assetExisted: true } : p));
    } catch (e) {
      setErr("存入复习失败：" + (e as Error).message);
      setPick((p) => (p ? { ...p, saveBusy: false } : p));
    }
  };

  // 「详细编辑」：打开 AssetCaptureSheet
  const openDetailEdit = async () => {
    if (!pick) return;
    let ipa = "";
    try {
      const ph = await api.phonetics([pick.word]);
      if (ph[0]) ipa = `/${ph[0]}/`;
    } catch { /* 音标留空 */ }
    setCapPrefill({ kind: "pronunciation", canonical: pick.word, ipa, problemType: pick.tag });
    setCapOpen(true);
  };

  // 卡顿处记为节奏问题
  const markRhythm = () => {
    setCapPrefill({ kind: "pronunciation", problemType: "rhythm" });
    setCapOpen(true);
  };

  // 存入语音回归集（英文样本：参考句=冻结目标句，假设=本次识别）
  const saveRegression = async () => {
    if (!lastBlobRef.current) return;
    setRegBusy(true); setErr("");
    try {
      await saveClip({
        blob: lastBlobRef.current, lang: "en", ref: resultTarget, source: "shadow",
        hyp: saidText, ms: 0, model: asr.modelId,
      });
      setRegSaved(true);
    } catch (e) { setErr("存入回归集失败：" + (e as Error).message); }
    finally { setRegBusy(false); }
  };

  const wordCount = target.trim() ? target.trim().split(/\s+/).length : 0;

  return (
    <div className="sh">
      <style>{`
        .sh-card{background:var(--card,#fff);border:1px solid var(--line,#e6e9ef);border-radius:14px;padding:18px;margin-bottom:16px}
        .sh-target{width:100%;min-height:74px;padding:11px 13px;font-family:var(--serif);font-size:17px;line-height:1.8;border:1px solid var(--line,#d9dee8);border-radius:10px;resize:vertical}
        .sh-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
        .sh-rec{min-width:132px}
        .sh-rec.rec{background:#c0392b}
        .sh-align{font-family:var(--serif);font-size:20px;line-height:2.3}
        .sh-w{display:inline-block;margin-right:7px;padding:1px 7px;border-radius:8px;cursor:default}
        .sh-w-wrap{display:inline-flex;align-items:center;margin-right:7px}
        .sh-w-wrap .sh-w{margin-right:0}
        .sh-tts{border:0;background:transparent;padding:1px 2px;font-size:12px;cursor:pointer;opacity:.4;line-height:1.2;border-radius:6px}
        .sh-tts:hover{opacity:1;background:#f1f3f7}
        .sh-w.hit{background:#e9f5ef;color:#1d6b46}
        .sh-w.hit.fuzzy{outline:1px dashed #8fbfa4}
        .sh-w.miss{background:#fdeceb;color:#b3261e;text-decoration:line-through;cursor:help}
        .sh-w.sub{background:#fdf3e3;color:#9a6200;cursor:pointer}
        .sh-w.extra{background:#eef0f3;color:#6b7280;font-style:italic;font-size:15px}
        .sh-w[onclick]{cursor:pointer}
        .sh-w.clickable{cursor:pointer;border:1px solid transparent}
        .sh-w.clickable:hover{border-color:#c9a36b}
        .sh-w.added{opacity:.62}
        .sh-added{font-style:normal;margin-left:3px;font-size:12px;color:#1d6b46}
        .sh-stats{display:flex;gap:14px;flex-wrap:wrap;margin:12px 0;font-size:13px;color:var(--ink-3);align-items:center}
        .sh-stats b{color:var(--ink)}
        .sh-score{display:inline-flex;flex-direction:column;line-height:1.25;background:#f6f8fb;border:1px solid var(--line,#e6e9ef);border-radius:10px;padding:5px 11px;min-width:76px;text-align:center}
        .sh-score em{font-style:normal;font-size:11px;color:var(--ink-3)}
        .sh-score b{font-size:19px}
        .sh-pill{font-size:12px;padding:2px 9px;border-radius:20px;background:#f2f4f8}
        .sh-said{font-size:13px;color:var(--ink-3);margin-top:6px}
        .sh-gap{color:#9a6200;font-size:12px;margin-left:6px}
        .sh-inline{margin:10px 0 4px;padding:12px 14px;border:1px solid #d9b88a;background:#fdf8f0;border-radius:12px}
        .sh-inline-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .sh-inline-head b{font-size:16px;color:#9a6200}
        .sh-tag-seg{display:inline-flex}
        .sh-tag-seg button{font-size:12px;padding:3px 10px}
        .sh-x{margin-left:auto;border:0;background:transparent;font-size:20px;cursor:pointer;color:var(--ink-3);line-height:1}
        .sh-inline-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
        .sh-re-pass{margin-top:8px;font-size:13px;color:#1d6b46}
        .sh-re-fail{margin-top:8px;font-size:13px;color:#9a6200}
        .sh-pick-sent{font-family:var(--serif);font-size:14px;color:var(--ink-2);margin-top:8px;line-height:1.7;background:#fff;border:1px dashed var(--line,#e6e9ef);border-radius:8px;padding:7px 10px}
      `}</style>

      <div className="page-head"><h2>跟读台</h2>
        <span className="muted">V6 · 看句朗读 → 离线识别 → 漏词/疑似替换/节奏提示（录音不上传）</span></div>

      {reviewActive && reviewQueue[reviewIdx] && (
        <div className="sh-card" style={{ borderColor: "#d9b88a", background: "#fdf8f0" }}>
          <strong>跟读续练 · 1/3/7</strong>
          <span className="sh-pill" style={{ marginLeft: 8 }}>第 {reviewIdx + 1} / {reviewQueue.length} 句</span>
          {reviewQueue[reviewIdx].sourceTitle && (
            <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>来自：{reviewQueue[reviewIdx].sourceTitle}</span>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            练过的句子按 1 天 → 3 天 → 7 天提醒重练，不生成复习卡；完成下方比对即自动推进。
          </div>
          {phase === "done" && (
            <div className="sh-row" style={{ marginTop: 10 }}>
              <button className="primary" onClick={reviewNext}>下一句续练 →</button>
              <button className="ghost2" onClick={reviewDismiss}>这句不用再练</button>
            </div>
          )}
        </div>
      )}
      {reviewMsg && <div className="sh-card" style={{ background: "#fdf8f0" }}>{reviewMsg}</div>}

      <div className="sh-card">
        <div className="sh-cover" aria-hidden="true"><ProcCover seed={target.trim() || "shadow-idle"} /></div>
        <strong>① 目标句</strong>
        <textarea className="sh-target form-input" style={{ marginTop: 8 }} value={target}
          onChange={(e) => setTarget(e.target.value)} placeholder="粘贴或输入要跟读的英文句子" />
        <div className="sh-row">
          <button className="ghost2" onClick={() => { stopOwnClip(); audioRef.current?.pause(); speak(target); }} disabled={!target.trim()}>
            <Icon name="Speaker" size={14} /> 听示范（整句）
          </button>
          <button className="ghost2" onClick={() => setCapOpen(true)} disabled={!target.trim()}>转为练习</button>
          <span className="sh-pill">{wordCount} 词</span>
        </div>
      </div>

      <div className="sh-card">
        <strong>② 朗读并比对</strong>
        <div className="sh-row">
          {phase !== "recording"
            ? (
              <button className="gbtn gbtn-lg rec-key" disabled={phase === "working"} onClick={start}
                aria-label={phase === "working" ? "识别中" : "开始跟读"}>
                <Icon name={phase === "working" ? "Retry" : "Voice"} size={24} />
                <span>{phase === "working" ? "识别中" : "开始跟读"}</span>
              </button>
            ) : (
              <button className="gbtn gbtn-lg rec-key end" onClick={stop} aria-label="停止并比对">
                <Icon name="Stop" size={24} />
                <span>停止比对</span>
              </button>
            )}
          {phase === "recording" && <span className="muted">正在录音，读完点"停止并比对"</span>}
          {phase === "working" && <span className="muted">本地 Whisper 转写与对齐中…</span>}
          {audioUrl && <audio ref={audioRef} src={audioUrl} controls style={{ height: 34 }}
            onPlay={() => { stopSpeaking(); stopOwnClip(); }} />}
        </div>

        {res && (
          <>
            {target.trim() !== resultTarget && (
              <div className="sh-said" style={{ color: "#9a6200" }}>目标句已被修改；当前比对与"加入复习"均基于录音时冻结的原句，重新点"开始跟读"可刷新。</div>
            )}
            <div className="sh-stats">
              {(() => {
                const accuracy = res.saidCount ? Math.round((res.hit / res.saidCount) * 100) : 0;
                const completeness = res.refCount ? Math.round((res.hit / res.refCount) * 100) : 0;
                return (
                  <div className="sh-scores">
                    <RingGauge pct={accuracy} label="文本匹配度" size={96} />
                    <RingGauge pct={completeness} label="完整度" size={96} />
                    <RingGauge pct={fluencyScore(res)} label="流利度" size={96} />
                  </div>
                );
              })()}
              <span>漏词 <b style={{ color: res.misses.length ? "#b3261e" : undefined }}>{res.misses.length}</b></span>
              <span>疑似替换 <b style={{ color: res.subs.length ? "#9a6200" : undefined }}>{res.subs.length}</b></span>
              <span>多读 <b>{res.extras.length}</b></span>
              <span>用时 <b>{res.durationSec}s</b></span>
              <span>语速 <b>{res.spokenWpm} wpm</b></span>
              {res.gaps.length > 0 && <span className="sh-gap">卡顿 {res.gaps.length} 处（停顿&gt;1.2s）</span>}
            </div>
            <div className="sh-row" style={{ marginTop: 0 }}>
              <button className="ghost2" disabled={regBusy || regSaved} onClick={saveRegression}>
                {regSaved ? <><Icon name="CheckCircle" size={14} /> 已存入回归集</>
                  : regBusy ? "保存中…" : <><Icon name="Plus" size={14} /> 存入语音回归集</>}
              </button>
              <span className="muted" style={{ fontSize: 12 }}>用于在语音页用不同模型重跑、定档位</span>
            </div>

            <div className="sh-align">
              {res.ops.map((op, i) => {
                // 小喇叭：听模型读单个词（extra 多读词不提供）
                const ttsBtn = (word: string, key: string) => (
                  <button key={key} className="sh-tts" title="听模型读这个词"
                    onClick={(e) => { e.stopPropagation(); modelSay(word); }} aria-label="听模型读这个词"><Icon name="Speaker" size={12} /></button>
                );
                if (op.kind === "hit") return (
                  <span key={i} className="sh-w-wrap">
                    <span className={"sh-w hit clickable" + (op.fuzzy ? " fuzzy" : "")}
                      title={op.fuzzy ? `识别为「${op.said}」，近形宽松命中；点此只回听这个词` : "点此只回听这个词"}
                      onClick={() => playOwn(i)}>{op.ref}</span>
                    {ttsBtn(op.ref, "t" + i)}
                  </span>
                );
                if (op.kind === "miss") {
                  const isAdded = added.has(op.ref.toLowerCase());
                  const isOpen = pick?.idx === i;
                  return (
                    <span key={i} className="sh-w-wrap">
                      <span className={"sh-w miss clickable" + (isAdded ? " added" : "")}
                        title={isAdded ? "已加入复习" : isOpen ? "再点一次关闭"
                          : "参考句有、未识别到——点此打开练习卡（漏词无录音切片）"}
                        onClick={() => clickProblem(i)}>
                        {op.ref}{isAdded && <em className="sh-added">✓</em>}
                      </span>
                      {ttsBtn(op.ref, "t" + i)}
                    </span>
                  );
                }
                if (op.kind === "sub") {
                  const isAdded = added.has(op.ref.toLowerCase());
                  const isOpen = pick?.idx === i;
                  return (
                    <span key={i} className="sh-w-wrap">
                      <span className={"sh-w sub clickable" + (isAdded ? " added" : "")}
                        title={isAdded ? "已加入复习" : isOpen ? "再点一次关闭"
                          : "疑似读成别的词，点此打开练习卡"}
                        onClick={() => clickProblem(i)}>
                        {op.ref}→{op.said}{isAdded && <em className="sh-added">✓</em>}
                      </span>
                      {ttsBtn(op.ref, "t" + i)}
                    </span>
                  );
                }
                return <span key={i} className="sh-w-wrap">
                  <span className="sh-w extra clickable" title="多读出来的词，点此只回听这个词" onClick={() => playOwn(i)}>{op.said}</span>
                </span>;
              })}
            </div>

            {pick && (
              <div className="sh-inline">
                <div className="sh-inline-head">
                  <b>{pick.word}</b>
                  <span className="muted" style={{ fontSize: 12 }}>问题类型</span>
                  <div className="seg sh-tag-seg">
                    <button className={pick.tag === "segmental" ? "seg-on" : ""}
                      onClick={() => setPickTag("segmental")}>音素</button>
                    <button className={pick.tag === "weakform" ? "seg-on" : ""}
                      onClick={() => setPickTag("weakform")}>弱读</button>
                    <button className={pick.tag === "rhythm" ? "seg-on" : ""}
                      onClick={() => setPickTag("rhythm")}>节奏</button>
                  </div>
                  <button className="sh-x" title="关闭" onClick={() => setPick(null)}>×</button>
                </div>
                <div className="sh-inline-row">
                  <button onClick={() => modelSay(pick.word)}>🔈 模型音</button>
                  <button onClick={() => pick.span && playSpan(pick.span)} disabled={!pick.span}>
                    🎧 我的录音
                  </button>
                  <button className="primary" disabled={pick.reBusy} onClick={rerecordWord}>
                    {pick.reBusy ? "识别中…" : "🎙 再读这个词"}
                  </button>
                  <button disabled={pick.saveBusy || pick.saved} onClick={savePronAsset}>
                    {pick.saved ? "✓ 已存入复习" : pick.saveBusy ? "存入中…" : "存入复习"}
                  </button>
                  <button className="ghost2" onClick={openDetailEdit}>详细编辑</button>
                </div>
                {pick.rePass !== null && (
                  <div className={pick.rePass ? "sh-re-pass" : "sh-re-fail"}>
                    文本匹配度 {pick.reMatch}% · {pick.rePass ? "本次识别通过 ✓" : "本次未识别到该词，可再试或回听"}
                    {!pick.assetExisted && (
                      <span className="muted">（练习不会自动建卡，需要时点「存入复习」）</span>
                    )}
                  </div>
                )}
                <div className="sh-pick-sent">{resultTarget}</div>
              </div>
            )}
            {schedNote && <div className="sh-said" style={{ color: "#1d6b46" }}>{schedNote}</div>}

            {res.gaps.length > 0 && (
              <div className="sh-said">节奏位置：{res.gaps.map((g, i) => <span key={i} className="sh-pill" style={{ marginRight: 6, cursor: "pointer" }}
            title="记为节奏问题" onClick={() => markRhythm()}>「{g.afterRef}」后停 {g.sec}s</span>)}</div>
            )}
            <div className="sh-said">识别原文：{saidText || "（未识别到内容）"}</div>

            <div className="sh-said" style={{ borderTop: "1px dashed var(--line,#e6e9ef)", paddingTop: 10, marginTop: 10 }}>
              说明：以上为本地 Whisper 转写与参考文本的词级对齐，<b>不是发音评分</b>。漏词/替换也可能来自识别误差，
              不直接计为发音错误。点<b>红色漏词 / 橙色疑似替换</b>打开就地练习卡（再点一次关闭）：可听模型音、回听自己的切片、
              当场再读复判、或一键存入复习；「再读」只是练习观察，不会自动建卡。近形（如单复数、时态尾音）按宽松命中处理。
            </div>
          </>
        )}
      </div>

      {err && <div className="err">{err}</div>}
      <AssetCaptureSheet open={capOpen}
        source={{ originKind: "shadow", originRef: "sh-" + shHash(target), title: "跟读台", sentence: target }}
        initialText={target}
        prefill={capPrefill}
        onClose={() => { setCapOpen(false); setCapPrefill(null); }}
        onWord={(w: string, sent: string) => api.createShadowNote({ word: w, sentence: sent })}
        onDone={(kind, r) => {
          if (kind === "pronunciation" && r?.asset_id) {
            void api.addPronProductionCard(r.asset_id).catch(() => {});
          }
          setCapOpen(false); setCapPrefill(null);
        }} />
    </div>
  );
}
