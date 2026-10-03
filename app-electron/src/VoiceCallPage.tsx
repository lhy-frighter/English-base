// 语音通话页 v2.1（iOS 式）：
// pre-call 深色沉浸（头像/目标包 chips/绿色大圆开始键）→ in-call 全屏（相位+计时+电平+圆形玻璃控制键，
// 转写不再平铺、全部进小结）→ 挂断小结 → 复盘。通话记录收进右侧玻璃抽屉（下钻按钮）。
import { useEffect, useRef, useState } from "react";
import { api, type CloudConsent } from "./api";
import { CallEngine, type CallPack, type CallPhase } from "./call/call-engine";
import { type CallTurn } from "./call/call-state";
import { DebriefPanel } from "./components/DebriefPanel";
import { Icon } from "./icons";
import type { DebriefCandidate } from "./api";

const PACKS: { id: CallPack; name: string; desc: string }[] = [
  { id: "free", name: "自由对话", desc: "随便聊，AI 会控制难度并轻纠错" },
  { id: "cet6", name: "六级口语", desc: "按六级口试形式组织话题与追问" },
  { id: "ielts", name: "雅思口语", desc: "Part 1–3 风格，练表达与流利度" },
  { id: "review_today", name: "今日弱点", desc: "通话中刻意带你练今日薄弱资产" },
];

const PHASE_LABEL: Record<CallPhase, string> = {
  connecting: "连接中…",
  listening: "聆听中 · 请说话",
  thinking: "AI 思考中…",
  speaking: "AI 说话中 · 可随时打断",
  reconnecting: "处理打断中…",
};

interface CallSummary {
  turns: CallTurn[];
  secs: number;
  sessionKey: string;
  bargeIn: { muteMs: number; replayMs: number } | null;
  firstAudioMs: number | null;
}

interface CallRec {
  sessionKey: string; title: string; startedAt: number;
  mins: number; status: string;
}

// 助手完成轮 → 复盘候选（整句作为表达 chunk；太短的寒暄不收）
function summaryCandidates(turns: CallTurn[]): DebriefCandidate[] {
  const out: DebriefCandidate[] = [];
  for (const t of turns) {
    if (t.role !== "assistant" || t.status !== "completed") continue;
    const text = t.text.trim().replace(/\s+/g, " ");
    if (text.length < 12 || text.split(" ").length < 3) continue;
    out.push({ kind: "chunk", canonical: text, sentence: text });
    if (out.length >= 12) break;
  }
  return out;
}

function fmtClock(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

// 通话记录抽屉（pre-call 与 in-call 共用）
function HistoryDrawer({ recs, onClose }: { recs: CallRec[] | null; onClose: () => void }) {
  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <div className="drawer-right">
        <div className="drawer-head">
          <h3>通话记录</h3>
          <button className="ghost2" style={{ marginLeft: "auto", padding: "5px 14px" }} onClick={onClose}>关闭</button>
        </div>
        <div className="drawer-body">
          {(recs ?? []).length === 0 && (
            <div className="muted" style={{ fontSize: 13 }}>
              还没有通话记录。完成第一次通话后，这里会显示每次通话的时间与时长。
            </div>
          )}
          {(recs ?? []).map((r) => (
            <button key={r.sessionKey} className="callrec-row" onClick={onClose}>
              <span className="cr-ico"><Icon name="Call" size={17} /></span>
              <span>
                <b>{r.title}</b>
                <span>{new Date(r.startedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {r.status === "closed" ? "已结束" : "进行中"}</span>
              </span>
              <span className="cr-dur">{r.mins > 0 ? `${r.mins} 分钟` : "—"}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export default function VoiceCallPage({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
  const [consent, setConsent] = useState<CloudConsent | null>(null);
  const [keySet, setKeySet] = useState(false);
  const [pack, setPack] = useState<CallPack>("free");
  const [topic, setTopic] = useState("");
  const [err, setErr] = useState("");

  const [inCall, setInCall] = useState(false);
  const [turns, setTurns] = useState<CallTurn[]>([]);
  const [phase, setPhase] = useState<CallPhase>("connecting");
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const engineRef = useRef<CallEngine | null>(null);
  const callStartRef = useRef(0);

  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [debriefOpen, setDebriefOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [recs, setRecs] = useState<CallRec[] | null>(null);

  const refresh = () =>
    api.cloudGetConsent().then((r) => { setConsent(r.consent); setKeySet(r.keySet); })
      .catch((e) => setErr(String(e.message)));
  useEffect(() => { void refresh(); }, []);

  // 通话计时
  useEffect(() => {
    if (!inCall) return;
    const t = setInterval(() => setElapsed(callStartRef.current ? Math.floor((Date.now() - callStartRef.current) / 1000) : 0), 500);
    return () => clearInterval(t);
  }, [inCall]);

  const loadRecs = () => {
    api.convList(40).then((list) => {
      setRecs(list.filter((c) => c.sessionKey.startsWith("call:")).map((c) => ({
        sessionKey: c.sessionKey, title: c.title || "语音通话",
        startedAt: c.startedAt, mins: Math.round((c.activeMs ?? 0) / 60000),
        status: c.status,
      })));
    }).catch(() => setRecs([]));
  };
  const openHistory = () => { setHistOpen(true); loadRecs(); };

  // 离开页面时确保挂断
  useEffect(() => () => { void engineRef.current?.hangUp(); }, []);

  const toggleAudioConsent = async () => {
    if (!consent) return;
    setErr("");
    try {
      const next = { ...consent, audio: !consent.audio, updatedAt: Date.now() };
      setConsent(await api.cloudSaveConsent(next));
    } catch (e) { setErr((e as Error).message); }
  };

  const start = async () => {
    setErr("");
    setSummary(null);
    setDebriefOpen(false);
    const missing: string[] = [];
    if (!keySet) missing.push("未保存 API Key（设置 → API Key）");
    if (!consent?.audio) missing.push("未开启「录音原文上云」授权（设置 → 云端授权；通话必须实时发送）");
    if (missing.length) { setErr("开始通话前还需要：" + missing.join("；") + "。"); return; }

    const engine = new CallEngine({
      onTurns: setTurns,
      onPhase: setPhase,
      onLevel: setLevel,
      onError: (m) => setErr(m),
    });
    engineRef.current = engine;
    setTurns([]);
    setInCall(true);
    callStartRef.current = Date.now();
    setElapsed(0);
    try {
      await engine.start({ pack, topic });
    } catch (e) {
      setErr("通话启动失败：" + (e as Error).message);
      await engine.hangUp();
      engineRef.current = null;
      setInCall(false);
    }
  };

  const hangUp = async () => {
    const eng = engineRef.current;
    const out = (await eng?.hangUp()) ?? [];
    engineRef.current = null;
    setInCall(false);
    setLevel(0);
    // 挂断即小结：有实际内容才展示；复盘草稿在打开面板时自动持久化（今日页可恢复）
    if (out.length && eng?.callSessionKey) {
      setSummary({
        turns: out,
        secs: callStartRef.current ? Math.round((Date.now() - callStartRef.current) / 1000) : 0,
        sessionKey: eng.callSessionKey,
        bargeIn: eng.lastBargeIn ? { muteMs: eng.lastBargeIn.muteMs, replayMs: eng.lastBargeIn.replayMs } : null,
        firstAudioMs: eng.serverToFirstAudioMs,
      });
    }
    void refresh();
  };

  const packName = PACKS.find((p) => p.id === pack)?.name ?? "自由对话";

  /* ============ 通话中：iOS 式全屏（转写不再平铺，全部进小结） ============ */
  if (inCall) {
    const eng = engineRef.current;
    return (
      <div className="page vcall-page">
        <div className="vcall-page-ios">
          <div className="vcall-ios-glow" />
          <button className="vcall-cbtn" style={{ position: "absolute", top: 18, right: 18, width: 44, height: 44 }}
            onClick={openHistory} title="通话记录"><Icon name="Calendar" size={18} /></button>
          <div className="vcall-ios-avatar">梯</div>
          <div className="vcall-ios-name">英语通话 · {packName}</div>
          <div className="vcall-ios-status">
            {PHASE_LABEL[phase]}{elapsed > 0 ? ` · ${fmtClock(elapsed)}` : ""}
            {turns.length > 0 ? ` · 已交换 ${turns.length} 轮` : ""}
          </div>
          <div className="vcall-ios-meter"><i style={{ width: `${Math.round(level * 100)}%` }} /></div>
          {eng?.lastBargeIn && (
            <div className="vcall-ios-status" style={{ marginTop: 14 }}>
              上次打断：静音 {Math.round(eng.lastBargeIn.muteMs)}ms · 重连 {Math.round(eng.lastBargeIn.replayMs)}ms
            </div>
          )}
          <div className="vcall-ios-controls">
            <button className="vcall-cbtn talk" onClick={() => engineRef.current?.manualInterrupt()} title="AI 说话时按此插入你的话">
              <Icon name="Sparkles" size={20} />打断
            </button>
            <button className="vcall-cbtn end" onClick={() => void hangUp()} title="结束通话">
              <Icon name="Call" size={24} style={{ transform: "rotate(135deg)" }} />
            </button>
            <button className="vcall-cbtn" onClick={openHistory} title="通话记录">
              <Icon name="Calendar" size={20} />记录
            </button>
          </div>
          {err && <div className="vcall-ios-status" style={{ color: "#ff9c93" }}>{err}</div>}
        </div>
        {histOpen && <HistoryDrawer recs={recs} onClose={() => setHistOpen(false)} />}
      </div>
    );
  }

  /* ============ 通话小结（闭环收口：转写留存 + 复盘入复习） ============ */
  if (summary) {
    const mm = Math.floor(summary.secs / 60), ss = summary.secs % 60;
    const userTurns = summary.turns.filter((t) => t.role === "user").length;
    return (
      <div className="page vcall-page">
        <div className="page-head">
          <h2>通话小结</h2>
          <span className="muted">本次通话已存入对话历史，可随时回看</span>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
            <span>⏱ 时长 <b>{mm}:{String(ss).padStart(2, "0")}</b></span>
            <span>💬 来回 <b>{userTurns}</b> 轮</span>
            {summary.bargeIn && <span>✂️ 打断 静音 <b>{Math.round(summary.bargeIn.muteMs)}ms</b> · 重连 <b>{Math.round(summary.bargeIn.replayMs)}ms</b></span>}
            {summary.firstAudioMs !== null && <span>🔊 首音 <b>{Math.round(summary.firstAudioMs)}ms</b></span>}
          </div>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 16, maxHeight: 420, overflow: "auto" }}>
          <strong>通话记录</strong>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {summary.turns.map((t, i) => (
              <div key={i} className={"vcall-bubble " + (t.role === "user" ? "vcall-bubble-user" : "vcall-bubble-ai")}>
                {t.text}
                {t.status === "interrupted" && <em className="vcall-cut">（被打断）</em>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button className="today-primary" style={{ flex: 1 }} onClick={() => setDebriefOpen(true)}>
            <span className="tp-main">复盘本次通话</span>
            <span className="tp-sub">勾选 AI 的表达，批量加入复习队列</span>
          </button>
          <button className="ghost2" onClick={() => setSummary(null)}>返回配置</button>
        </div>

        {/* 配置缺失时给出直达入口：文案只说「设置 → API Key」而不给按钮，
            等于让用户自己去找——这里把按钮摆出来（#206）。 */}
        {(err && (!keySet || !consent?.audio)) ? (
          <div className="err" style={{ marginTop: 12 }}>
            <div>{err}</div>
            {onOpenSettings && (
              <button className="ghost2" style={{ marginTop: 8 }} onClick={onOpenSettings}>
                去设置
              </button>
            )}
          </div>
        ) : err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}

        {debriefOpen && (
          <DebriefPanel
            ctx={{ originKind: "conversation", originRef: summary.sessionKey, title: "语音通话复盘", sessionKey: summary.sessionKey }}
            initial={summaryCandidates(summary.turns)}
            onClose={() => setDebriefOpen(false)}
          />
        )}
      </div>
    );
  }

  /* ============ pre-call：iOS 式深色沉浸 ============ */
  const missing: string[] = [];
  if (!keySet) missing.push("未保存 API Key（设置 → API Key）");
  if (!consent?.audio) missing.push("录音原文上云未同意");
  const ready = missing.length === 0;

  return (
    <div className="page vcall-page">
      <div className="vcall-page-ios" style={{ minHeight: "calc(100vh - 96px)" }}>
        <div className="vcall-ios-glow" />
        <button className="vcall-cbtn" style={{ position: "absolute", top: 18, right: 18, width: 44, height: 44 }}
          onClick={openHistory} title="通话记录"><Icon name="Calendar" size={18} /></button>
        <div className="vcall-ios-avatar">梯</div>
        <div className="vcall-ios-name">语音通话</div>
        <div className="vcall-ios-status">全双工对话 · 随时打断 · 结束自动复盘</div>

        <div className="vcall-pack-row">
          {PACKS.map((p) => (
            <button key={p.id} className={"vcall-pack-chip" + (pack === p.id ? " on" : "")}
              title={p.desc} onClick={() => setPack(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
        <input
          className="vcall-topic-input"
          value={topic} onChange={(e) => setTopic(e.target.value)}
          placeholder="可选：指定开场话题，例如 my internship at the racing team"
        />
        <button className="vcall-start-round" onClick={() => void start()} disabled={!ready}
          title={ready ? "开始通话" : missing.join("；")}>
          <Icon name="Call" size={30} />
        </button>
        <div className="vcall-ios-status" style={{ marginTop: 12 }}>
          {ready ? `开始一次「${packName}」· Realtime 约 0.18 元/分钟` : "开始前需要：" + missing.join("；")}
        </div>
        <div style={{ position: "relative", marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <button className={"vcall-pack-chip" + (consent?.audio ? " on" : "")} onClick={() => void toggleAudioConsent()}>
            {consent?.audio ? "✓ 录音原文上云已同意" : "录音原文上云未同意（点击开启）"}
          </button>
          {!keySet && <span className="vcall-pack-chip" style={{ borderColor: "rgba(255,156,147,.6)" }}>缺 API Key（对话页设置）</span>}
        </div>
        {err && <div className="vcall-ios-status" style={{ color: "#ff9c93" }}>{err}</div>}
      </div>

      {histOpen && <HistoryDrawer recs={recs} onClose={() => setHistOpen(false)} />}
    </div>
  );
}
