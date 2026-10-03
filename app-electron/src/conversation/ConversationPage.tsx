import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ConvSession, type ConvTurn, type CloudConsent } from "../api";
import { localEngine, cloudEngine, CURRENT_MODEL } from "./runtime";
import {
  selectWindow,
  SUMMARY_SYSTEM_PROMPT,
  summaryUserMessage,
  type ChatMsg,
} from "./context-window";
import { startCapture, type VoiceCapture } from "./voice-input";
import { asr } from "../asr/asr";
import { inference } from "../inference/coordinator";
import { translator } from "../translate/translate";
import { startStreamingSpeaker, type StreamingSpeaker } from "../tts";
import { ttsSafeText } from "../tts-chunks";
import { VadController } from "./vad-controller";
import { Icon } from "../icons";
import { Seg, Modal, EmptyState } from "../components/ui";
import { persist } from "../persist";
import { TurnAssembler, type AssemblerState } from "./turn-assembler";
import { smartTurn } from "./smartturn";
import { AssetCaptureSheet } from "../components/AssetCaptureSheet";
import { tutorGate, type TutorMode } from "./tutor-gate";
import { systemPrompt } from "./conversation-prompt";
import { splitTeach, visibleOfStream, stripTeachRaw, type TeachPayload } from "./teach-parse";
import { TutorTeachPanel } from "./TutorTeachPanel";
import { GrammarDiagnosisPanel } from "../components/GrammarDiagnosisPanel";
import { analyzeGrammar } from "./grammar-engine";
import type { GrammarAnalysis } from "./grammar-engine";
import type { CapturePrefill } from "../components/AssetCaptureSheet";
import type { DebriefCandidate } from "../api";

type EnginePhase = "idle" | "loading" | "ready" | "error";

const CEFR_LEVELS = ["A2", "B1", "B2", "C1"];
const TOPIC_PRESETS = [
  "Campus life and studies",
  "Travel and transport",
  "Technology and AI",
  "Hobbies and daily life",
  "Job interview practice",
  "Academic research discussion",
];

function fmtWhen(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// S15-1 深度分析失败原因 → 人话提示
function grammarReason(reason: string): string {
  if (reason === "grammar_consent_off") return "需先在云端设置勾选「文本送云端做语法深度分析」";
  if (reason === "cloud_key_missing") return "请先在云端设置保存 API Key";
  if (reason === "cloud_endpoint_missing") return "云端端点缺失";
  if (reason === "bad_json" || reason.startsWith("schema_failed")) return "结构化分析失败，可重试";
  return "深度分析失败：" + reason;
}

export interface UsePrompt { assetId: number; canonical: string; kind: string; }
export default function ConversationPage({
  onSendShadow, usePrompt, onPromptConsumed,
  examDrill, onExamDrillConsumed, onOpenSettings,
}: {
  onSendShadow?: (text: string, opts?: {
    originKind?: string; originRef?: string;
    textId?: number; title?: string;
  }) => void;
  usePrompt?: UsePrompt | null;
  /** 打开统一设置页（云端配置已收进那里，#206） */
  onOpenSettings?: () => void;
  onPromptConsumed?: () => void;
  examDrill?: import("../api").ExamWeakItem | null;
  onExamDrillConsumed?: () => void;
}) {
  const [view, setView] = useState<"setup" | "chat">("setup");
  const [history, setHistory] = useState<ConvSession[]>([]);
  const [session, setSession] = useState<ConvSession | null>(null);
  const [turns, setTurns] = useState<ConvTurn[]>([]);
  const [input, setInput] = useState("");
  const [cap, setCap] = useState<{ text: string; ref: string; sentence?: string; prefill?: CapturePrefill; gloss?: string } | null>(null);
  const capWord = useCallback(async (word: string, sentence: string) =>
    api.createShadowNote({ word, sentence }), []);
  const [busy, setBusy] = useState(false);
  const [enginePhase, setEnginePhase] = useState<EnginePhase>("idle");
  const [loadPct, setLoadPct] = useState(0);
  const [streaming, setStreaming] = useState("");
  const [ending, setEnding] = useState(false);
  const [formGoal, setFormGoal] = useState(TOPIC_PRESETS[0]);
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [formCefr, setFormCefr] = useState("B1");
  const [formTurns, setFormTurns] = useState(8);
  // V8-4 引擎选择：云端默认，本地可选
  const [engine, setEngine] = useState<"cloud" | "local">("cloud");

  // V8-2d 云端同意（默认全关，纯本地）
  const [cloud, setCloud] = useState<CloudConsent | null>(null);
  const [keySet, setKeySet] = useState(false);
  const [cloudMsg, setCloudMsg] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeMsRef = useRef(0);
  const learnKeyRef = useRef<string | null>(null);
  const promptedRef = useRef<number[]>([]);
  const weakAssetsRef = useRef<import("./conversation-prompt").WeakAssetSeed[]>([]);
  const [passedTurns, setPassedTurns] = useState<Set<string>>(new Set());
  const summaryRef = useRef(""); // 运行摘要（仅提示上下文，不是学习事实源）
  const [compacting, setCompacting] = useState(false);
  // V9 tutor：强制模式（显式入口）、待消费 TEACH（#147 教学面板使用，不写库）
  const forceModeRef = useRef<TutorMode>("auto");
  const [forceModeTick, setForceModeTick] = useState(0);
  const [teachMap, setTeachMap] = useState<Record<string, TeachPayload>>({});
  // S15-1 语法深度诊断结果（按 turnKey）
  const [grammarMap, setGrammarMap] = useState<Record<string, GrammarAnalysis>>({});
  const [grammarBusy, setGrammarBusy] = useState<string | null>(null);
  const [capAnalyzing, setCapAnalyzing] = useState(false);
  // 「转为练习」自动填释义：TEACH 中文 → Bergamot 本地翻译 → 云端快译；失败则留空，不阻塞
  const openCap = async (textRaw: string, refKey: string) => {
    const text = textRaw.trim();
    if (!text) return;
    setCap({ text, ref: refKey });
    setCapAnalyzing(true);
    let gloss = teachMap[refKey]?.zh ?? "";
    try {
      if (!gloss) {
        try {
          await inference.acquire("translation");
          const r = await translator.translate([text], false);
          gloss = r.zh?.[0] ?? "";
        } catch { gloss = ""; }
        finally { inference.release("translation").catch(() => {}); }
      }
      if (!gloss && engine === "cloud") {
        try { gloss = await cloudEngine.quickTranslate(text); } catch { gloss = ""; }
      }
      if (gloss) setCap((prev) => (prev && prev.ref === refKey ? { ...prev, gloss } : prev));
    } finally {
      setCapAnalyzing(false);
    }
  };

  // TEACH 面板「整句加入复习」：一键直接入库（点击即用户确认），不弹 sheet
  const quickCaptureTeach = async (
    turnKey: string,
    prefill: CapturePrefill,
    sentence: string,
  ): Promise<string> => {
    const canon = (prefill.canonical || "").replace(/\s+/g, " ").trim();
    if (!canon) throw new Error("内容为空");
    let h = 5381;
    for (let i = 0; i < canon.length; i++) h = ((h << 5) + h + canon.charCodeAt(i)) | 0;
    const idem = `ui-conversation-${turnKey}-chunk-${(h >>> 0).toString(36)}`;
    const r = await api.captureAsset({
      asset_kind: "chunk",
      canonical: canon,
      gloss: prefill.gloss || "",
      payload: {
        register: prefill.register,
        example_en: sentence,
        example_zh: prefill.exampleZh || undefined,
        zh_intent: prefill.gloss || "",
      },
      test_point: "",
      idempotency_key: idem,
      encounter: {
        origin_kind: "conversation",
        origin_ref: turnKey,
        title: "英语对话",
        sentence,
        locator: { via: "teach-panel" },
      },
    });
    if (r.replayed) return "此前已收录（未重复建卡）";
    if (r.created) return `已加入复习（${r.cards_created} 张卡）`;
    return `已追加相遇（${r.cards_created} 张卡）`;
  };

  const refreshHistory = useCallback(() => {
    api.convList(12).then(setHistory).catch((e) => { console.error("[conv] 历史列表加载失败", e); });
  }, []);
  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  // 加载云端同意状态
  useEffect(() => {
    api.cloudGetConsent()
      .then((r) => { setCloud(r.consent); setKeySet(r.keySet); })
      .catch((e) => { console.error("[conv] 云端授权读取失败", e); });
  }, []);




  // S15-1：对用户某一轮做云端语法深度分析（再点一次收起面板）
  const openGrammar = async (t: ConvTurn) => {
    if (grammarMap[t.turnKey]) {
      setGrammarMap((prev) => { const n = { ...prev }; delete n[t.turnKey]; return n; });
      return;
    }
    setGrammarBusy(t.turnKey); setCloudMsg("");
    try {
      const idx = turns.findIndex((x) => x.turnKey === t.turnKey);
      const ctx = turns.slice(0, Math.max(0, idx)).slice(-6)
        .map((x) => (x.role === "user" ? "User: " : "Tutor: ")
          + (x.role === "user" ? x.text : (x.committedText || x.text)))
        .join("\n");
      const r = await analyzeGrammar(t.text, ctx);
      if (r.ok) setGrammarMap((prev) => ({ ...prev, [t.turnKey]: r.analysis }));
      else setCloudMsg(grammarReason(r.reason));
    } finally {
      setGrammarBusy(null);
    }
  };

  // 活跃时间累计（页面可见时每秒 +1）
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) activeMsRef.current += 1000;
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // learning_sessions（仪表盘）：heartbeat 20s
  useEffect(() => {
    if (view !== "chat" || !session) return;
    learnKeyRef.current = `conversation:${session.sessionKey}`;
    api.sessionBegin({
      kind: "conversation", sessionKey: learnKeyRef.current,
      refType: "conversation", refId: session.sessionKey,
      titleSnapshot: session.title, unit: "turns", amount: 0,
    }).catch((e) => { console.error("[conv] 学习会话开始写入失败", e); });
    const hb = setInterval(() => {
      void persist("sessionHeartbeat", api.sessionHeartbeat(learnKeyRef.current!, activeMsRef.current, userTurnCount(), {}));
    }, 20000);
    return () => clearInterval(hb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, session?.sessionKey]);

  const userTurnCount = () => turns.filter((t) => t.role === "user").length;

  // 自动滚底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, streaming]);

  const ensureEngine = useCallback(async () => {
    if (localEngine.isLoaded(CURRENT_MODEL)) { setEnginePhase("ready"); return; }
    setEnginePhase("loading"); setLoadPct(0);
    try {
      await inference.acquire("llm");
      await localEngine.load(CURRENT_MODEL, (p: unknown) => {
        const pct = Math.round((p as { progress?: number }).progress || 0);
        setLoadPct(pct);
      });
      setEnginePhase("ready");
    } catch (e) {
      console.error(e);
      setEnginePhase("error");
      throw e;
    }
  }, []);

  // S13-d-1 哪些对话句已跟读通过
  useEffect(() => {
    if (!turns.length) { setPassedTurns(new Set()); return; }
    let alive = true;
    Promise.all(turns.map((t) => api.shadowPassedForTurn(t.turnKey)
      .then((f) => [t.turnKey, f] as [string, boolean])))
      .then((rs) => {
        if (!alive) return;
        setPassedTurns(new Set(rs.filter(([, f]) => f).map(([k]) => k)));
      }).catch((e) => { console.error("[conv] 跟读通过状态加载失败", e); });
    return () => { alive = false; };
  }, [turns]);

  const startSession = async () => {
    const goal = formGoal.trim();
    if (!goal) return;
    const sess = await api.convCreate({
      goal, cefr: formCefr, suggestedTurns: formTurns,
      brainEngine: engine, brainModelRevision: engine === "local"
        ? CURRENT_MODEL : (cloud?.model || "glm-4.7-flash"),
    });
    activeMsRef.current = 0;
    summaryRef.current = "";
    try {
      const weak = await api.priorityList({ limit: 2, kinds: ["chunk", "grammar", "pronunciation"] });
      weakAssetsRef.current = weak.map((p) => ({
        canonical: p.canonical, gloss: p.gloss, kind: p.asset_kind,
      }));
    } catch { weakAssetsRef.current = []; }
    setSession(sess); setTurns([]); setView("chat"); setInput(""); setTeachMap({}); setGrammarMap({});
  };

  // S13-b-2 「再用一次」：自动开引导会话，让用户用指定表达造句
  useEffect(() => {
    if (!usePrompt) return;
    let alive = true;
    (async () => {
      try {
        const goal = `Use the expression '${usePrompt.canonical}' in your own sentence`;
        const sess = await api.convCreate({
          goal, cefr: "B1", suggestedTurns: 4,
          brainEngine: engine,
          brainModelRevision: engine === "local"
            ? CURRENT_MODEL : (cloud?.model || "glm-4.7-flash"),
        });
        if (!alive) return;
        const guideKey = `turn:${crypto.randomUUID()}`;
        const guide = await api.convAddTurn({
          sessionKey: sess.sessionKey, turnKey: guideKey, role: "assistant",
          text: `Now try using \u201c${usePrompt.canonical}\u201d in your own sentence. I will give you feedback.`,
          status: "completed",
        });
        if (!alive) return;
        activeMsRef.current = 0; summaryRef.current = "";
        weakAssetsRef.current = [];
        setSession(sess); setTurns([guide]); setView("chat"); setInput(""); setTeachMap({}); setGrammarMap({});
        promptedRef.current = [usePrompt.assetId];
        onPromptConsumed?.();
      } catch (e) {
        setCloudMsg(String(e)); onPromptConsumed?.();
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usePrompt]);

  // S13-d-2 错题对话演练：带考点开会话，先解释再请用户造句
  useEffect(() => {
    if (!examDrill) return;
    let alive = true;
    (async () => {
      try {
        const point = examDrill.point || examDrill.reason || "the tested expression";
        const goal = `Help me master this CET-6 point: ${point}. `
          + `Question context: ${examDrill.stem}`
          + (examDrill.answer ? ` (correct answer: ${examDrill.answer})` : "")
          + `. Explain it briefly, then invite me to make my own sentence with it.`;
        const sess = await api.convCreate({
          goal, cefr: "B1", suggestedTurns: 5,
          brainEngine: engine,
          brainModelRevision: engine === "local"
            ? CURRENT_MODEL : (cloud?.model || "glm-4.7-flash"),
        });
        if (!alive) return;
        const guideKey = `turn:${crypto.randomUUID()}`;
        const guide = await api.convAddTurn({
          sessionKey: sess.sessionKey, turnKey: guideKey, role: "assistant",
          text: `Let us work on this point together. Here is the question: ${examDrill.stem} `
            + (examDrill.answer ? `The correct answer is ${examDrill.answer}. ` : "")
            + `Now, can you make your own sentence using this point?`,
          status: "completed",
        });
        if (!alive) return;
        activeMsRef.current = 0; summaryRef.current = "";
        weakAssetsRef.current = [];
        setSession(sess); setTurns([guide]); setView("chat"); setInput(""); setTeachMap({}); setGrammarMap({});
        onExamDrillConsumed?.();
      } catch (e) {
        setCloudMsg(String(e)); onExamDrillConsumed?.();
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examDrill]);

  const openHistory = async (sess: ConvSession) => {
    const data = await api.convGet(sess.sessionKey);
    if (!data) return;
    summaryRef.current = "";
    setSession(data.session); setTurns(data.turns); setView("chat");
  };

  const backToSetup = useCallback(async (abandon: boolean) => {
    if (session && learnKeyRef.current) {
      void persist("sessionClose", api.sessionClose(learnKeyRef.current, activeMsRef.current, userTurnCount(), {}));
      if (abandon) void persist("convClose(abandoned)", api.convClose({ sessionKey: session.sessionKey, activeMs: activeMsRef.current, status: "abandoned" }));
    }
    learnKeyRef.current = null;
    summaryRef.current = "";
    weakAssetsRef.current = [];
    setCompacting(false);
    void stopHandsFree();
    setView("setup"); setSession(null); setTurns([]); setStreaming(""); setTeachMap({}); setGrammarMap({});
    refreshHistory();
  }, [session, refreshHistory]);

  // —— V8-3 语音输入 ——
  const captureRef = useRef<VoiceCapture | null>(null);
  const latencyRef = useRef<{
    asr: number[]; firstToken: number[]; firstAudio: number[]; mute: number[]; reRecord: number[];
  }>(
    { asr: [], firstToken: [], firstAudio: [], mute: [], reRecord: [] },
  );
  const stopRequestedRef = useRef(false);
  const [micState, setMicState] = useState<"idle" | "recording" | "asr">("idle");
  const [asrDraft, setAsrDraft] = useState("");
  const [micErr, setMicErr] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [speakPhase, setSpeakPhase] = useState<"idle" | "loading" | "speaking">("idle");
  const speakerRef = useRef<StreamingSpeaker | null>(null);

  // —— V8-VAD 免提对话 ——
  const [handsFree, setHandsFree] = useState(false);
  const [vadSpeaking, setVadSpeaking] = useState(false);
  const vadRef = useRef<VadController | null>(null);
  const busyRef = useRef(false);
  const autoPendingRef = useRef(false); // ASR 处理中，忽略新的语音段
  const bargeInRef = useRef(false); // 本段语音是在 AI 播放中开口（barge-in）
  // S13-0b：TurnAssembler 把 VAD 段自动收束成轮（Smart Turn 语义判定）
  const assemblerRef = useRef<TurnAssembler | null>(null);
  const [assemblerState, setAssemblerState] = useState<AssemblerState>("idle");
  useEffect(() => { busyRef.current = busy; }, [busy]);

  const toggleMic = async () => {
    if (busy || !session || micState === "asr") return;
    if (micState === "recording") {
      const t0 = performance.now();
      setMicState("asr"); setMicErr("");
      try {
        const cap = captureRef.current;
        if (!cap) throw new Error("录音未开始");
        const { pcm } = await cap.stop();
        await inference.acquire("asr");
        await asr.init("wasm", "whisper-base");
        const r = await asr.transcribe(pcm);
        latencyRef.current.asr.push(Math.round(performance.now() - t0));
        setAsrDraft(r.text);
      } catch (e) {
        setMicErr("识别失败：" + ((e as Error).message || String(e)));
      } finally {
        setMicState("idle");
      }
      return;
    }
    setMicErr(""); setAsrDraft("");
    try {
      captureRef.current = await startCapture();
      setMicState("recording");
    } catch (e) {
      setMicErr("无法开始录音：" + ((e as Error).message || String(e)));
    }
  };

  const confirmAsr = () => {
    const t = asrDraft.trim();
    if (!t) return;
    setAsrDraft("");
    void send(t);
  };

  const doInterrupt = () => {
    if (!busyRef.current) return;
    stopRequestedRef.current = true;
    if (speakerRef.current) speakerRef.current.stop(); // 立即静音
    (engine === "cloud" ? cloudEngine : localEngine).interrupt(); // 通知当前引擎停止，后台收敛
  };

  const interruptPlayback = () => {
    if (!busy) return;
    const t0 = performance.now();
    doInterrupt();
    latencyRef.current.mute.push(Math.round(performance.now() - t0));
    const reT0 = performance.now();
    const tick = setInterval(() => {
      if (!busy) {
        clearInterval(tick);
        latencyRef.current.reRecord.push(Math.round(performance.now() - reT0));
      }
    }, 30);
  };

  // —— 免提回路 ——
  // AI 播放/生成中用户真正开始说话 → 立即 barge-in 打断；该段语音结束后自动转写发送。
  const onVadRealStart = () => {
    if (autoPendingRef.current) return;
    if (busyRef.current) {
      bargeInRef.current = true;
      doInterrupt();
    }
  };

  // TurnAssembler 整轮收束完成：校验 → 暂停 VAD → 转写发送
  const onAssemblerCommit = (pcm: Float32Array) => {
    setVadSpeaking(false);
    const vad = vadRef.current;
    if (pcm.length < 16000 * 0.25) { vad?.start(); return; } // 整轮短于 0.25s 忽略
    if (autoPendingRef.current) return;
    // AI 仍在忙且本轮没有触发 barge-in（极端竞态）→ 不处理
    if (busyRef.current && !bargeInRef.current) { vad?.start(); return; }
    const wasBargeIn = bargeInRef.current;
    bargeInRef.current = false;
    autoPendingRef.current = true;
    vad?.pause();
    void transcribeAndSend(pcm, wasBargeIn);
  };

  // 整轮 PCM → ASR 转写 → 发送（含 barge-in 收敛与 VAD 恢复）
  const transcribeAndSend = async (audio: Float32Array, wasBargeIn: boolean) => {
    const vad = vadRef.current;
    let text = "";
    try {
      const t0 = performance.now();
      await inference.acquire("asr");
      await asr.init("wasm", "whisper-base");
      const r = await asr.transcribe(audio);
      latencyRef.current.asr.push(Math.round(performance.now() - t0));
      text = r.text.trim();
    } catch (e) {
      setMicErr("识别失败：" + ((e as Error).message || String(e)));
      vad?.start();
    } finally {
      autoPendingRef.current = false;
    }
    if (text) {
      // send 进入 busy 后再恢复 VAD，避免间隙重复成轮
      const resumeOnStarted = () => vad?.start();
      if (wasBargeIn) {
        // 等待打断轮收敛完成再发送，避免与旧轮互相覆盖
        const tick = setInterval(() => {
          if (!busyRef.current) {
            clearInterval(tick);
            void send(text, resumeOnStarted);
          }
        }, 40);
        setTimeout(() => { clearInterval(tick); vad?.start(); }, 8000);
      } else {
        void send(text, resumeOnStarted);
      }
      // 兜底：send 若被校验拦截未进入 busy，1.5s 后恢复聆听
      setTimeout(() => { if (!busyRef.current) vad?.start(); }, 1500);
    } else {
      vad?.start();
    }
  };

  const toggleHandsFree = async () => {
    if (handsFree) {
      const vad = vadRef.current;
      vadRef.current = null;
      assemblerRef.current?.reset();
      assemblerRef.current = null;
      setAssemblerState("idle");
      void smartTurn.dispose();
      setHandsFree(false);
      setVadSpeaking(false);
      if (vad) await vad.destroy();
      return;
    }
    setMicErr("");
    try {
      // Smart Turn 预热（失败不阻塞：判定异常时 assembler 逐段直接提交，退回旧行为）
      void smartTurn.init().catch(() => {});
      const assembler = new TurnAssembler({
        predict: (pcm) => smartTurn.predict(pcm),
        onCommit: onAssemblerCommit,
        onStateChange: (s) => setAssemblerState(s),
      });
      assemblerRef.current = assembler;
      const vad = await VadController.create({
        onStateChange: (speaking) => setVadSpeaking(speaking),
        onSpeechStart: (t) => assembler.notifyStart(t),
        onSpeechRealStart: () => onVadRealStart(),
        onSpeechEnd: (audio, t) => { void assembler.notifyEnd(t, audio); },
        onMisfire: () => setVadSpeaking(false),
      });
      vad.start();
      vadRef.current = vad;
      setHandsFree(true);
    } catch (e) {
      setMicErr("免提开启失败：" + ((e as Error).message || String(e)));
    }
  };

  const stopHandsFree = async () => {
    const vad = vadRef.current;
    vadRef.current = null;
    assemblerRef.current?.reset();
    assemblerRef.current = null;
    setAssemblerState("idle");
    void smartTurn.dispose();
    setHandsFree(false);
    setVadSpeaking(false);
    if (vad) await vad.destroy().catch(() => {});
  };

  const send = async (textArg?: string, onStarted?: () => void) => {
    const text = (textArg ?? input).trim();
    if (busy || !session) return;
    const gate = tutorGate(text);
    if (!gate.ok) { setCloudMsg(gate.reason); return; }
    // 云端前置校验：必须已授权历史文本、已保存 key
    if (engine === "cloud") {
      if (!cloud?.historyText) { setCloudMsg("云端对话需先在云端设置中勾选「上传历史对话文本」"); return; }
      if (!keySet) { setCloudMsg("请先在云端设置中保存 API Key"); return; }
    }
    setBusy(true); onStarted?.(); setInput(""); setAsrDraft(""); setMicErr(""); setCloudMsg("");
    const userKey = `turn:${crypto.randomUUID()}`;
    const asstKey = `turn:${crypto.randomUUID()}`;
    const modelRev = engine === "local" ? CURRENT_MODEL : (cloud?.model || "");
    const userTurn = await api.convAddTurn({
      sessionKey: session.sessionKey, turnKey: userKey, role: "user", text, status: "user_confirmed",
    });
    // S13-b 用出证据：引导用出/自然用出/纠正后用出（中文轮内部跳过，失败不阻塞）
    {
      const prompted = promptedRef.current.splice(0);
      void persist("detectUsedAssets", api.detectUsedAssets({
        sessionKey: session.sessionKey, turnKey: userKey, text, prompted,
      }));
    }
    const asstTurn = await api.convAddTurn({
      sessionKey: session.sessionKey, turnKey: asstKey, role: "assistant", text: "",
      status: "generating", provider: engine, modelRevision: modelRev,
    });
    setTurns((prev) => [...prev, userTurn, asstTurn]);
    await runGeneration(asstKey, undefined, userTurn, forceModeRef.current);
    forceModeRef.current = "auto";
    setForceModeTick((x) => x + 1);
  };

  // 通用生成流程：本地/云端同构；extraUser 为本次刚落库的用户轮（state 尚未刷新时使用）。
  const runGeneration = async (
    asstKey: string,
    kindOverride?: "cloud" | "local",
    extraUser?: ConvTurn,
    mode: TutorMode = "auto",
  ) => {
    try {
      const useCloud = (kindOverride ?? engine) === "cloud";
      const activeEngine = useCloud ? cloudEngine : localEngine;
      if (useCloud) {
        if (inference.llmActive) await inference.release("llm"); // 云端发送前卸载本地大脑
        setEnginePhase("ready");
      } else {
        await ensureEngine();
      }
      const baseTurns = extraUser ? [...turns, extraUser] : turns;
      const allMsgs: ChatMsg[] = [
        ...baseTurns.filter((t) => t.role === "user" || t.status === "completed"
          || (t.status === "interrupted" && !!t.committedText)),
      ].map((t) => ({
        role: t.role,
        content: t.role === "assistant" && t.status === "interrupted" ? t.committedText : t.text,
      }));
      const { window: win, overflow } = selectWindow(allMsgs);
      if (overflow.length) {
        // 旧轮次压缩为运行摘要（仅提示上下文；原始轮次仍以数据库为准）
        setCompacting(true);
        const summaryMessages = [
          { role: "system", content: SUMMARY_SYSTEM_PROMPT },
          { role: "user", content: summaryUserMessage(summaryRef.current, overflow) },
        ];
        let sText = "";
        const summaryStream = activeEngine.stream(summaryMessages as any, { temperature: 0.2, maxTokens: 180 });
        for await (const chunk of summaryStream) sText = chunk.text;
        summaryRef.current = sText.trim();
        setCompacting(false);
      }
      const messages = [
        { role: "system", content: systemPrompt(
          session!.topic, false, mode, weakAssetsRef.current) },
        ...(summaryRef.current
          ? [{ role: "system", content: `Earlier conversation summary (for context only):\n${summaryRef.current}` }]
          : []),
        ...win,
      ];
      const genT0 = performance.now();
      const speaker = startStreamingSpeaker({
        enabled: voiceOn,
        onFirstAudio: () => latencyRef.current.firstAudio.push(Math.round(performance.now() - genT0)),
        onPhase: (ph) => setSpeakPhase(ph),
      });
      speakerRef.current = speaker;
      let full = "";
      let firstTokenSeen = false;
      stopRequestedRef.current = false;
      const gen = activeEngine.stream(messages as any, { maxTokens: 220 });
      for await (const chunk of gen) {
        full = chunk.text; setStreaming(visibleOfStream(chunk.text));
        if (!firstTokenSeen && stripTeachRaw(chunk.text).trim()) {
          firstTokenSeen = true;
          latencyRef.current.firstToken.push(Math.round(performance.now() - genT0));
        }
        speaker.feed(ttsSafeText(stripTeachRaw(chunk.text)));
        if (stopRequestedRef.current) break;
      }
      let playedCharEnd = 0;
      let interruptedNow = false;
      if (stopRequestedRef.current) {
        playedCharEnd = speaker.stop(); // 已静音，冻结已播游标
        speakerRef.current = null;
        interruptedNow = true;
      } else {
        await speaker.end();
        playedCharEnd = speaker.playedCharEnd;
        speakerRef.current = null;
      }
      const split = splitTeach(full);
      if (!split.teach && /\[TEACH/i.test(full)) {
        // 模型输出了 TEACH 但未通过校验：留痕便于定位（截断/字段不对应等）
        console.warn("[teach] 原始输出含 TEACH 标记但校验未通过：", full.slice(-400));
      }
      const reply = split.visible;
      let asstTurn: ConvTurn;
      if (interruptedNow) {
        const committed = reply.slice(0, playedCharEnd);
        asstTurn = await api.convUpdateTurn({
          turnKey: asstKey, status: "interrupted", text: reply, committedText: committed,
          playedCharEnd, interruptedAt: Date.now(),
        });
      } else {
        asstTurn = await api.convUpdateTurn({
          turnKey: asstKey, status: "completed", text: reply, committedText: reply, playedCharEnd,
        });
      }
      // TEACH 尾块：挂教学面板（草稿，不自动成卡）
      const teachNow = split.teach;
      if (teachNow) setTeachMap((prev) => ({ ...prev, [asstKey]: teachNow }));
      setTurns((prev) => prev.map((t) => (t.turnKey === asstKey ? asstTurn : t)));
      setStreaming("");
    } catch (e) {
      setStreaming("");
      setCompacting(false);
      if (speakerRef.current) { speakerRef.current.stop(); speakerRef.current = null; setSpeakPhase("idle"); }
      let code = (e as Error).message?.slice(0, 120) || "unknown";
      if (code.startsWith("cloud_http_429")) code = "云端模型繁忙（访问量过大），可稍后重试或切本地";
      else if (code.startsWith("cloud_http_401")) code = "云端 key 无效或过期，请重新保存";
      const asstTurn = await api.convUpdateTurn({ turnKey: asstKey, status: "failed", errorCode: code })
        .catch(() => null);
      if (asstTurn) setTurns((prev) => prev.map((t) => (t.turnKey === asstKey ? asstTurn : t)));
    } finally {
      setBusy(false);
    }
  };

  // 云端失败后：云端重试或切本地重试（复用失败的 assistant 轮，不新增轮次）。
  const retryFailedTurn = async (useLocal: boolean) => {
    if (!session || busy) return;
    const failed = [...turns].reverse().find((t) => t.role === "assistant" && t.status === "failed");
    if (!failed) return;
    if (!useLocal && (!cloud?.historyText || !keySet)) {
      setCloudMsg("云端重试需先勾选「上传历史对话文本」并保存 key");
      return;
    }
    const kind: "cloud" | "local" = useLocal ? "local" : "cloud";
    setEngine(kind);
    setBusy(true); setCloudMsg("");
    const modelRev = useLocal ? CURRENT_MODEL : (cloud?.model || "");
    const reset = await api.convUpdateTurn({
      turnKey: failed.turnKey, status: "generating", errorCode: "",
      provider: kind, modelRevision: modelRev,
    });
    setTurns((prev) => prev.map((t) => (t.turnKey === failed.turnKey ? reset : t)));
    await runGeneration(failed.turnKey, kind);
  };

  const endSession = async () => {
    if (!session || busy) return;
    setBusy(true); setEnding(true);
    await stopHandsFree();
    const sumKey = `turn:${crypto.randomUUID()}`;
    let sumTurn = await api.convAddTurn({
      sessionKey: session.sessionKey, turnKey: sumKey, role: "assistant",
      text: "", status: "generating", provider: "local", modelRevision: CURRENT_MODEL,
    });
    setTurns((prev) => [...prev, sumTurn]);
    try {
      await ensureEngine();
      const convoAll: ChatMsg[] = turns
        .filter((t) => t.role === "user" || t.status === "completed"
          || (t.status === "interrupted" && !!t.committedText))
        .map((t) => ({
          role: t.role,
          content: t.role === "assistant" && t.status === "interrupted" ? t.committedText : t.text,
        }));
      const { window: convoWin, overflow: convoOverflow } = selectWindow(convoAll);
      if (convoOverflow.length && !summaryRef.current) {
        const summaryMessages = [
          { role: "system", content: SUMMARY_SYSTEM_PROMPT },
          { role: "user", content: summaryUserMessage("", convoOverflow) },
        ] as Parameters<typeof localEngine.stream>[0];
        let s = "";
        const summaryStream = localEngine.stream(summaryMessages, { temperature: 0.2, maxTokens: 180 });
        for await (const chunk of summaryStream) s = chunk.text;
        summaryRef.current = s.trim();
      }
      const messages = [
        { role: "system", content: systemPrompt(session.topic, true) },
        ...(summaryRef.current
          ? [{ role: "system", content: `Earlier conversation summary (for context only):\n${summaryRef.current}` }]
          : []),
        ...convoWin,
      ] as Parameters<typeof localEngine.stream>[0];
      let full = "";
      const stream = localEngine.stream(messages, { maxTokens: 260 });
      for await (const chunk of stream) { full = chunk.text; setStreaming(chunk.text); }
      setStreaming("");
      sumTurn = await api.convUpdateTurn({
        turnKey: sumKey, status: "completed", text: full.trim(), committedText: full.trim(),
      });
      setTurns((prev) => prev.map((t) => (t.turnKey === sumKey ? sumTurn : t)));
      if (learnKeyRef.current) {
        void persist("sessionClose", api.sessionClose(learnKeyRef.current, activeMsRef.current, userTurnCount(), {}));
      }
      await api.convClose({ sessionKey: session.sessionKey, activeMs: activeMsRef.current, status: "closed" });
      learnKeyRef.current = null;
      // S13-a-2 复盘草稿：本场 TEACH 的词块/词（已沉淀的由 captureAsset identity 幂等兜底）
      try {
        const candidates: DebriefCandidate[] = [];
        for (const t of Object.values(teachMap)) {
          for (const c of t.chunks) {
            if (!c.en.trim()) continue;
            candidates.push({ kind: "chunk", canonical: c.en, gloss: c.zh, sentence: t.en,
              payload: { example_en: t.en, example_zh: t.zh, zh_intent: t.zh } });
          }
          for (const w of t.words) {
            if (!w.en.trim()) continue;
            candidates.push({ kind: "word", canonical: w.en, gloss: w.zh, sentence: t.en });
          }
        }
        if (candidates.length) {
          await api.debriefPut({ origin_kind: "conversation", origin_ref: session.sessionKey, candidates });
        }
      } catch { /* 草稿失败不阻塞结束 */ }
      setView("setup"); setSession(null); setTurns([]); setTeachMap({}); setGrammarMap({});
      refreshHistory();
    } catch (e) {
      const code = (e as Error).message?.slice(0, 120) || "unknown";
      sumTurn = await api.convUpdateTurn({ turnKey: sumKey, status: "failed", errorCode: code }).catch(() => sumTurn);
      setTurns((prev) => prev.map((t) => (t.turnKey === sumKey ? sumTurn : t)));
    } finally {
      setStreaming(""); setBusy(false); setEnding(false);
    }
  };

  // ==================== Setup（微信式：会话列表为主，新建走模态，设置走抽屉） ====================
  if (view === "setup") {
    return (
      <div className="page">
        <div className="page-head">
          <h2>对话</h2>
          <span className="muted">和 AI 练口语 · 逐轮轻纠错 · 结束有复盘</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="conv-hist-btn" onClick={() => setSettingsOpen(true)}>
              <Icon name="Settings" size={15} />设置
            </button>
            <button className="btn-primary" onClick={() => setNewOpen(true)}>
              <Icon name="Plus" size={15} />新对话
            </button>
          </span>
        </div>

        <div className="conv-list-main card">
          {history.length === 0 ? (
            <EmptyState seed="conv-list" text="还没有对话。点右上「新对话」，选个话题开始第一次口语练习。"
              action={<button className="btn-primary" onClick={() => setNewOpen(true)}>开始第一次对话</button>} />
          ) : history.map((h) => (
            <button key={h.sessionKey} className="conv-list-row" onClick={() => { void openHistory(h); }}>
              <span className="conv-row-avatar">{(h.title || "对话").trim().charAt(0).toUpperCase()}</span>
              <span className="conv-row-main">
                <b>{h.title}</b>
                <span>{fmtWhen(h.startedAt)} · {h.turnsCount} 轮 · {h.status === "open" ? "进行中" : h.status === "closed" ? "已结束" : "已放弃"}</span>
              </span>
              <span className="tb-go"><Icon name="ChevronRight" size={16} /></span>
            </button>
          ))}
        </div>

        {newOpen && (
          <Modal title="新对话" onClose={() => setNewOpen(false)} width={520}>
            <label className="conv-label">对话引擎</label>
            <Seg ariaLabel="对话引擎" value={engine} onChange={setEngine}
              options={[{ value: "cloud", label: "云端 GLM" }, { value: "local", label: "本地 3B" }]} />
            <label className="conv-label">话题目标</label>
            <input className="conv-input" value={formGoal} onChange={(e) => setFormGoal(e.target.value)}
              placeholder="想聊什么？" />
            <div className="conv-presets">
              {TOPIC_PRESETS.map((t) => (
                <button key={t} className={formGoal === t ? "chip chip-on" : "chip"} onClick={() => setFormGoal(t)}>{t}</button>
              ))}
            </div>
            <div className="conv-row">
              <div>
                <label className="conv-label">难度锚点</label>
                <Seg ariaLabel="难度锚点" value={formCefr} onChange={setFormCefr}
                  options={CEFR_LEVELS.map((c) => ({ value: c, label: c }))} />
              </div>
              <div>
                <label className="conv-label">建议轮数</label>
                <Seg ariaLabel="建议轮数" value={String(formTurns)} onChange={(v) => setFormTurns(Number(v))}
                  options={["6", "8", "10", "12"].map((n) => ({ value: n, label: n }))} />
              </div>
            </div>
            <button className="btn-primary conv-start" style={{ width: "100%" }}
              onClick={() => { setNewOpen(false); void startSession(); }}>开始对话</button>
          </Modal>
        )}

        {settingsOpen && (
          <>
          <div className="drawer-mask" onClick={() => setSettingsOpen(false)} />
            <div className="drawer-right">
              <div className="drawer-head">
                <h3>云端设置</h3>
                <button className="ghost2" style={{ marginLeft: "auto", padding: "5px 14px" }} onClick={() => setSettingsOpen(false)}>关闭</button>
              </div>
              <div className="drawer-body">
                {/* 云端配置已收进「设置」页（端点/模型/Key/授权开关统一一处，#206）。
                    这里只留状态摘要 + 直达入口，避免两处配置各改一半、互相不知道。 */}
                <div className="cloud-summary">
                  <div className="cs-row">
                    <span className="cs-k">API Key</span>
                    <span className="cs-v">{keySet ? "已加密保存" : "未设置"}</span>
                  </div>
                  <div className="cs-row">
                    <span className="cs-k">端点</span>
                    <span className="cs-v">{cloud?.baseUrl || "未配置"}</span>
                  </div>
                  <div className="cs-row">
                    <span className="cs-k">模型</span>
                    <span className="cs-v">{cloud?.model || "未配置"}</span>
                  </div>
                  {onOpenSettings && (
                    <button className="btn-primary" style={{ marginTop: 14 }} onClick={onOpenSettings}>
                      前往设置
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ==================== Chat ====================
  const userTurns = turns.filter((t) => t.role === "user").length;
  const suggested = session?.topic.suggestedTurns ?? 8;
  return (
    <div className="page conv-chat-page">
      <div className="page-head conv-chat-head">
        <button className="ghost2" onClick={() => { void backToSetup(true); }}>← 新话题</button>
        <h2>{session?.title}</h2>
        <span className="muted">{session?.topic.cefr} · {userTurns}/{suggested} 轮</span>
        <div className="seg conv-engine-seg">
          <button className={engine === "cloud" ? "seg-on" : ""} disabled={busy} onClick={() => setEngine("cloud")}>云端</button>
          <button className={engine === "local" ? "seg-on" : ""} disabled={busy} onClick={() => setEngine("local")}>本地</button>
        </div>
        <button
          className="ghost2"
          onClick={() => setVoiceOn((v) => !v)}
        >
          出声：{voiceOn ? "开" : "关"}{speakPhase === "speaking" ? " · 播放中" : ""}
        </button>
        <button
          className={handsFree ? "ghost2 conv-hf-on" : "ghost2"}
          onClick={() => { void toggleHandsFree(); }}
        >
          免提：{handsFree ? "开" : "关"}
        </button>
        <button className="ghost2" disabled={!busy} onClick={interruptPlayback}>打断</button>
        <button className="btn-primary conv-end" disabled={busy} onClick={() => { void endSession(); }}>
          {ending ? "复盘中…" : "结束并复盘"}
        </button>
      </div>

      {enginePhase === "loading" && (
        <div className="conv-loading">
          本地大脑首次加载中… {loadPct}%
          <div className="prog-track"><div className="prog-fill" style={{ width: `${loadPct}%` }} /></div>
        </div>
      )}
      {enginePhase === "error" && (
        <div className="conv-loading err-text">引擎加载失败，请重试或检查模型文件。</div>
      )}
      {compacting && (
        <div className="conv-loading">整理较早的对话…</div>
      )}

      <div className="conv-messages" ref={scrollRef}>
        {turns.map((t) => {
          if (t.role === "user") {
            const correction = (t.localFeedback as string[])[0];
            return (
              <div key={t.turnKey} className="conv-msg conv-user">
                <div className="conv-bubble">{t.text}</div>
                {correction && <div className="conv-correction">✏️ {correction}</div>}
                {t.text && (
                  <div className="conv-cap-row">
                    <button type="button" className="ghost2"
                      onClick={() => { void openCap(t.text, t.turnKey); }}>转为练习</button>
                    {/[A-Za-z]/.test(t.text) && (
                      <button type="button" className="ghost2"
                        onClick={() => { void openGrammar(t); }}>
                        {grammarBusy === t.turnKey ? "分析中…" : "深度语法分析"}
                      </button>
                    )}
                  </div>
                )}
                {grammarMap[t.turnKey] && (
                  <GrammarDiagnosisPanel
                    source={{ originKind: "conversation", originRef: t.turnKey, title: session?.title || "英语对话" }}
                    text={t.text}
                    analysis={grammarMap[t.turnKey]}
                    onClose={() => setGrammarMap((prev) => { const n = { ...prev }; delete n[t.turnKey]; return n; })}
                  />
                )}
              </div>
            );
          }
          const isLive = t.status === "generating";
          const text = isLive ? streaming : t.text;
          const shownText = t.status === "interrupted"
            ? (t.committedText || "")
            : text || (isLive ? "…" : "");
          // 助手中文回复 = 澄清问题（提示词限定只有澄清可以用中文）
          const isClarify = typeof shownText === "string" && /[\u4e00-\u9fff]/.test(shownText);
          return (
            <div key={t.turnKey} className="conv-msg conv-assistant">
              <div className={isClarify ? "conv-bubble conv-clarify-bubble" : "conv-bubble"}>
                {shownText}
                {passedTurns.has(t.turnKey) && <i className="shadow-pass-inline" title="已跟读通过">✓ 已跟读通过</i>}
                {t.status === "interrupted" && <em className="muted">（已打断）</em>}
                {t.status === "failed" && <em className="err-text">（生成失败：{t.errorCode}）</em>}
              </div>
              {t.status === "failed" && (
                <div className="conv-retry">
                  <button className="ghost2" onClick={() => { void retryFailedTurn(false); }}>云端重试</button>
                  <button className="ghost2" onClick={() => { void retryFailedTurn(true); }}>切本地重试</button>
                </div>
              )}
              {t.status === "completed" && (t.committedText || t.text) && (
                <div className="conv-cap-row">
                  <button type="button" className="ghost2"
                    onClick={() => { void openCap(t.committedText || t.text, t.turnKey); }}>转为练习</button>
                </div>
              )}
              {teachMap[t.turnKey] && (
                <TutorTeachPanel
                  teach={teachMap[t.turnKey]}
                  turnKey={t.turnKey}
                  onDismiss={() => setTeachMap((prev) => {
                    const n: Record<string, TeachPayload> = {};
                    for (const k of Object.keys(prev)) if (k !== t.turnKey) n[k] = prev[k];
                    return n;
                  })}
                  onPick={(prefill, sentence) => setCap({
                    text: prefill.canonical ?? "", ref: t.turnKey, sentence, prefill,
                  })}
                  onQuickCapture={(prefill, sentence) => quickCaptureTeach(t.turnKey, prefill, sentence)}
                />
              )}
            </div>
          );
        })}
      </div>

      {asrDraft && (
        <div className="conv-asr-bar">
          <span className="conv-asr-label">识别为（可修改）</span>
          <input
            className="conv-input"
            value={asrDraft}
            onChange={(e) => setAsrDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmAsr(); }}
          />
          <button className="btn-primary" onClick={confirmAsr}>发送</button>
          <button className="ghost2" onClick={() => setAsrDraft("")}>取消</button>
        </div>
      )}
      {micErr && <div className="conv-asr-bar"><em className="err-text">{micErr}</em></div>}
      {cloudMsg && <div className="conv-asr-bar"><em className="err-text">{cloudMsg}</em></div>}

      {handsFree && (
        <div className="conv-hf-hint">
          {assemblerState === "awaiting" ? (
            <span className="muted">似乎还没说完？继续说，或
              <button type="button" className="link-btn"
                onClick={() => assemblerRef.current?.commitNow()}>立即发送</button>
            </span>
          ) : vadSpeaking
            ? <span className="muted">正在聆听你说话…</span>
            : busy
              ? <span className="muted">AI 说话中，可直接开口打断</span>
              : <span className="muted">免提聆听中，说完会自动发送（建议佩戴耳机）</span>}
        </div>
      )}
      <div className="conv-mode-row">
        <button
          className={forceModeRef.current === "teach" ? "mode-btn mode-on" : "mode-btn"}
          disabled={busy}
          onClick={() => {
            forceModeRef.current = forceModeRef.current === "teach" ? "auto" : "teach";
            setForceModeTick((x) => x + 1);
          }}
        >教我怎么说</button>
        <button
          className={forceModeRef.current === "chat" ? "mode-btn mode-on" : "mode-btn"}
          disabled={busy}
          onClick={() => {
            forceModeRef.current = forceModeRef.current === "chat" ? "auto" : "chat";
            setForceModeTick((x) => x + 1);
          }}
        >我只是想聊天</button>
        {forceModeTick >= 0 ? null : null}
      </div>
      <div className="conv-input-bar glass-strong">
        {handsFree ? (
          <div className={vadSpeaking ? "mic-pill mic-pill-talk" : "mic-pill"}>
            {vadSpeaking ? "你在说话" : busy ? "AI 说话中" : "聆听中"}
          </div>
        ) : (
          <button
            className={micState === "recording" ? "gbtn end" : "gbtn"}
            disabled={busy || micState === "asr"}
            title={micState === "recording" ? "停止录音" : micState === "asr" ? "识别中…" : "点按录音说话"}
            aria-label={micState === "recording" ? "停止录音" : micState === "asr" ? "识别中" : "录音"}
            aria-pressed={micState === "recording"}
            onClick={() => { void toggleMic(); }}
          >
            <Icon name={micState === "recording" ? "Stop" : micState === "asr" ? "Retry" : "Voice"} size={19} />
          </button>
        )}
        <input
          className="conv-input"
          value={input}
          disabled={busy}
          placeholder={busy ? "大脑思考中…" : "输入英文，或点录音说话，回车发送"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
        />
        <button className="gbtn primary optical" disabled={busy || !input.trim()}
          title="发送（回车）" aria-label="发送" onClick={() => { void send(); }}>
          <Icon name="Send" size={18} />
        </button>
      </div>
      <AssetCaptureSheet
        open={!!cap}
        source={cap ? { originKind: "conversation", originRef: cap.ref, title: "英语对话", sentence: cap.sentence || cap.text } : null}
        initialText={cap?.text ?? ""}
        prefill={cap?.prefill ?? null}
        analyzing={capAnalyzing}
        autoGloss={cap?.gloss}
        onSendShadow={(sentence) => onSendShadow?.(sentence, {
          originKind: "conversation", originRef: cap?.ref ?? "",
        })}
        onClose={() => setCap(null)}
        onWord={capWord}
      />
    </div>
  );
}
