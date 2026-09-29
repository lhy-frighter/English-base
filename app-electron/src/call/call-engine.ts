// S14-1C：语音通话引擎
// 全双工：Server VAD 持续上行 → 下行 PCM 流式播放 → 本地 Silero / 服务端 speech_started 双路触发 barge-in
// barge-in：停播记已听样本 → cancel（best effort）→ 关旧连接 → instructions 内嵌裁剪历史重连 → 缓冲帧续发
// 闭环（S14-1C+#175）：全程落库 conversation_sessions/conversation_turns（provider=realtime）+ learning_sessions
//（仪表盘对话时长）+ 每个用户轮跑用出证据检测；挂断 convClose/sessionClose，复盘由页面用 debrief 草稿承接。
import {
  type CallTurn, type ResponseMap,
  ensureResponse, withTextDelta, withAudioSamples, markDone,
  heardPrefix, buildContextTranscript, trimTranscriptToChars, frameLevel,
} from "./call-state";
import { CallAudioPlayer } from "./audio-player";
import { VadController } from "../conversation/vad-controller";
import { api } from "../api";
// worklet 源码以 ?raw 内联进 bundle：new URL(import.meta.url) 方式在构建产物里没有对应资产，
// addModule 会指向不存在的 app://app/assets/pcm-worklet.js（麦克风帧永远产不出 → AI 听不到）
import pcmWorkletSrc from "./pcm-worklet.js?raw";

export type CallPack = "free" | "cet6" | "ielts" | "review_today";
export type CallPhase = "connecting" | "listening" | "thinking" | "speaking" | "reconnecting";

export interface CallEngineConfig {
  pack: CallPack;
  topic: string;
}

export interface CallEngineHandlers {
  onTurns: (turns: CallTurn[]) => void;
  onPhase: (phase: CallPhase) => void;
  onLevel: (level: number) => void;
  onError: (message: string) => void;
}

export interface BargeInTiming {
  at: number;
  muteMs: number;      // 触发 → 本地静音
  replayMs: number;    // 触发 → 新连接 ready
}

const MAX_CONTEXT_CHARS = 6000;
const RING_FRAMES = 8; // ~1024ms 环形缓冲，覆盖 VAD 确认延迟，重连后补发用户开口的起始部分
const READY_TIMEOUT_MS = 20_000;

export const PACK_TITLE: Record<CallPack, string> = {
  free: "自由对话",
  cet6: "六级口语",
  ielts: "雅思口语",
  review_today: "今日弱点",
};

function instructionsFor(pack: CallPack, topic: string): string {
  const base = [
    "You are an English speaking partner in a language-learning app. The learner is a Chinese university student (around CEFR B1-B2).",
    "Keep each turn short: 1-3 sentences. Use vocabulary slightly above the learner's level but always understandable.",
    "CORRECTION RULE: always check the learner's English. If there is ANY grammar, tense, or word-form mistake, you MUST append exactly one line at the very end of your reply: Better: <corrected natural English sentence>. A reply about a mistake without the Better: line is incomplete.",
    "- Ask follow-up questions to keep the conversation going.",
  ];
  if (pack === "cet6") base.push("Role: CET-6 oral examiner. Organize the talk around a CET-6 style topic with warm-up, a main topic statement, and follow-up questions.");
  if (pack === "ielts") base.push("Role: IELTS speaking examiner. Run Part 1 style questions first, then a Part 2 cue card and Part 3 abstract discussion.");
  if (pack === "review_today") base.push("Steer the conversation so the learner practices expressions they recently got wrong; invite them to reuse target phrases naturally.");
  if (topic.trim()) base.push("Opening topic chosen by the learner: " + topic.trim());
  // 语言规则放末尾（模型对结尾指令权重最高）。抽象条件句对音频模型基本无效（实测会整体倒向单一语言），
  // 改为"示范对话"：双语交替的最小对话直接演给它看，逐轮镜像学习者语言。
  // 注意：示例不能用 "You:"/"Learner:" 前缀——音频模型会把它模仿进回复里（实测）。
  base.push(
    "LANGUAGE RULE (most important): mirror the learner's language EVERY turn — English speech (even broken English) gets an entirely English reply with the Better: line for mistakes; Chinese speech gets the 3-part Chinese fallback. Examples of the pattern:",
    "- (learner, speaking English) Yesterday I go to the company and finish many report. → (your reply, all English) Oh nice, how did it go at the company? Better: Yesterday I went to the company and finished many reports.",
    "- (learner, speaking Chinese) 我今天很累，不知道怎么用英文说。 → (your reply) 辛苦啦！你可以这样说：I'm worn out today. So what made today so exhausting?",
    "- (learner, speaking English) Yeah my boss gave me many deadline this week. → (your reply, all English) That sounds intense. Better: My boss gave me many deadlines this week. What's the closest one?",
  );
  return base.join("\n");
}

type Waiter = { resolve: () => void; reject: (e: Error) => void };

// 模型偶尔会模仿提示词里示例对话的角色前缀（实测 "You: ..."），消费文本时统一剥掉
function stripRolePrefix(t: string): string {
  return t.replace(/^\s*You\s*:\s*/i, "").replace(/^\s*Assistant\s*:\s*/i, "");
}

export class CallEngine {
  private handlers: CallEngineHandlers;
  private port: MessagePort | null = null;
  private player: CallAudioPlayer | null = null;
  private micCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private vad: VadController | null = null;

  private turns: CallTurn[] = [];
  private responses: ResponseMap = {};
  private activeResponseId: string | null = null;
  private phase: CallPhase = "connecting";
  private stopped = false;

  private reconnecting = false;
  private pendingFrames: Int16Array[] = [];
  private ring: Int16Array[] = [];
  private lastUserItemId = "";
  private lastLangFixItemId = "";
  private langFixUntil = 0;          // 中文兜底冷却（重放音频的转写会再次触发 CJK 检测，防级联取消）
  private langFixSkipTransUntil = 0; // 重放音频自己的转写不作为新轮次入库
  // 服务端 speech_started→stopped 之间的上行帧缓存（中文兜底撤回重答时原样重放给模型）
  private utteranceFrames: Int16Array[] = [];
  private lastUtteranceFrames: Int16Array[] = [];
  private readyWaiters: Waiter[] = [];
  private replayedWaiters: Waiter[] = [];
  private readyFired = false;
  // 被打断的响应：其 response.done（cancel 收敛）携带完整文本，绝不能再入列/落库（G3 对账 P0）
  private interruptedIds = new Set<string>();

  lastBargeIn: BargeInTiming | null = null;
  serverToFirstAudioMs: number | null = null;
  private speechStoppedAt = 0;

  // —— 通话会话（闭环落库；全部尽力而为，失败绝不阻塞通话）——
  callSessionKey = "";
  packTitle = "";
  startedAt = 0;
  private learnKey = "";
  private heartbeatTimer: number | null = null;
  private phaseTimer: number | null = null;
  private persistedInterrupted = new Set<string>();
  private turnKeyByResponse: Record<string, string> = {};

  constructor(handlers: CallEngineHandlers) {
    this.handlers = handlers;
  }

  private setPhase(p: CallPhase) {
    this.phase = p;
    this.handlers.onPhase(p);
  }

  private emitTurns() { this.handlers.onTurns(this.turns.slice()); }

  private sessionFor(cfg: CallEngineConfig) {
    return {
      input_audio_format: "wav",
      output_audio_format: "pcm",
      instructions: instructionsFor(cfg.pack, cfg.topic),
      voice: "tongtong",
      turn_detection: { type: "server_vad" },
      beta_fields: { chat_mode: "audio", tts_source: "e2e" },
    };
  }

  private openRelayPort(): Promise<MessagePort> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onWinMsg);
        reject(new Error("打开中继通道超时（10s）"));
      }, 10_000);
      const onWinMsg = (e: MessageEvent) => {
        const d = e.data as { __realtimePort?: boolean; __realtimePortError?: boolean; message?: string } | null;
        if (d && d.__realtimePort) {
          clearTimeout(timer);
          window.removeEventListener("message", onWinMsg);
          resolve(e.ports[0]);
        } else if (d && d.__realtimePortError) {
          clearTimeout(timer);
          window.removeEventListener("message", onWinMsg);
          reject(new Error(d.message || "中继打开失败"));
        }
      };
      window.addEventListener("message", onWinMsg);
      const electronAPI = (window as unknown as { electronAPI: { realtimeOpen: (o?: unknown) => void } }).electronAPI;
      electronAPI.realtimeOpen({});
    });
  }

  async start(cfg: CallEngineConfig): Promise<void> {
    this.port = await this.openRelayPort();
    this.player = new CallAudioPlayer();
    await this.player.resume();
    this.port.onmessage = (ev: MessageEvent) => this.onPortMessage(ev.data);

    this.setPhase("connecting");
    const initialSession = this.sessionFor(cfg);
    this.baseInstructions = initialSession.instructions;
    this.packTitle = PACK_TITLE[cfg.pack] || "自由对话";
    this.startedAt = Date.now();
    const ready = this.waitForReady();
    this.port.postMessage({ kind: "connect", session: initialSession });
    await ready; // 超时/失败由 waitForReady reject，调用方（页面）负责 hangUp

    await this.startMic();
    await this.startVad();
    this.setPhase("listening");
    this.beginSessionRecord(cfg);
    // 相位校正节拍器：生成完（response.done）≠ 播放完——本地音频还在播时保持「AI 说话中」，
    // 播完自动回「聆听中」。打断窗口因此覆盖整个真实出声期（此前 done 即回聆听，播放期无法打断）
    this.phaseTimer = window.setInterval(() => this.refreshPhase(), 250);
  }

  private refreshPhase(): void {
    if (this.stopped || this.reconnecting || this.phase === "connecting") return;
    if (this.player?.isPlaying) {
      if (this.phase !== "speaking") this.setPhase("speaking");
      return;
    }
    if (this.activeResponseId) {
      if (this.phase !== "thinking" && this.phase !== "speaking") this.setPhase("thinking");
      return;
    }
    if (this.phase !== "listening") this.setPhase("listening");
  }

  // 落库：通话会话（对话历史）+ 学习会话（仪表盘）；20s 心跳上报活跃毫秒与用户轮数
  private beginSessionRecord(cfg: CallEngineConfig) {
    try {
      this.callSessionKey = "call:" + crypto.randomUUID();
      const title = ("通话·" + this.packTitle + (cfg.topic.trim() ? "·" + cfg.topic.trim().slice(0, 60) : "")).slice(0, 200);
      api.convCreate({
        sessionKey: this.callSessionKey,
        goal: title,
        cefr: "B2",
        suggestedTurns: 8,
        brainEngine: "realtime",
      }).catch(() => { this.callSessionKey = ""; });
      this.learnKey = "conversation:" + this.callSessionKey;
      api.sessionBegin({
        kind: "conversation", sessionKey: this.learnKey,
        refType: "conversation", refId: this.callSessionKey,
        titleSnapshot: title, unit: "turns", amount: 0,
      }).catch(() => { this.learnKey = ""; });
      this.heartbeatTimer = window.setInterval(() => {
        if (this.stopped || !this.learnKey) return;
        api.sessionHeartbeat(this.learnKey, Date.now() - this.startedAt, this.userTurnCount(), {}).catch(() => {});
      }, 20_000);
    } catch { /* 落库失败不影响通话 */ }
  }

  private userTurnCount(): number {
    return this.turns.filter((t) => t.role === "user").length;
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const w: Waiter = { resolve, reject };
      this.readyWaiters.push(w);
      setTimeout(() => {
        const i = this.readyWaiters.indexOf(w);
        if (i >= 0) {
          this.readyWaiters.splice(i, 1);
          reject(new Error("连接超时（20s），请检查网络与账户余额后重试"));
        }
      }, READY_TIMEOUT_MS);
    });
  }
  private waitForReplayed(): Promise<void> {
    return new Promise((resolve, reject) => {
      const w: Waiter = { resolve, reject };
      this.replayedWaiters.push(w);
      setTimeout(() => {
        const i = this.replayedWaiters.indexOf(w);
        if (i >= 0) {
          this.replayedWaiters.splice(i, 1);
          reject(new Error("重连超时"));
        }
      }, READY_TIMEOUT_MS);
    });
  }
  // 连接失败/中断：让等待方立刻脱困，通话回聆听态（尽力恢复，不假死）
  private failWaiters(message: string): void {
    if (!this.readyFired) {
      for (const w of this.readyWaiters.splice(0)) w.reject(new Error(message));
    }
    for (const w of this.replayedWaiters.splice(0)) w.reject(new Error(message));
    if (this.reconnecting) {
      this.reconnecting = false;
      this.activeResponseId = null;
      this.setPhase("listening");
    }
  }

  // —— 麦克风 ——

  private async startMic(): Promise<void> {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.micCtx = new Ctor();
    const workletUrl = URL.createObjectURL(new Blob([pcmWorkletSrc], { type: "application/javascript" }));
    await this.micCtx.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);
    this.workletNode = new AudioWorkletNode(this.micCtx, "pcm-stream");
    this.workletNode.port.onmessage = (e: MessageEvent) => this.onMicFrame(e.data as Int16Array);
    // 麦克风源必须接到 worklet 输入（缺失则 worklet 无输入、永远产不出帧 → AI 听不到）
    this.micSource = this.micCtx.createMediaStreamSource(this.micStream);
    this.micSource.connect(this.workletNode);
    // 经零增益接 destination：保证 worklet 被处理，但不产生侧音回放
    const silent = this.micCtx.createGain();
    silent.gain.value = 0;
    silent.connect(this.micCtx.destination);
    this.workletNode.connect(silent);
  }

  private async startVad(): Promise<void> {
    this.vad = await VadController.create({
      onSpeechStart: () => this.onLocalSpeechStart(),
      onSpeechEnd: () => { /* 通话走 Server VAD，本地仅取 speech start */ },
    });
    this.vad.start();
  }

  private onMicFrame(frame: Int16Array): void {
    this.handlers.onLevel(frameLevel(frame));
    const copy = Int16Array.from(frame);
    this.ring.push(copy);
    if (this.ring.length > RING_FRAMES) this.ring.shift();
    this.utteranceFrames.push(copy);
    if (this.utteranceFrames.length > 600) this.utteranceFrames.shift(); // 上限 ~76s
    if (this.reconnecting) {
      if (this.pendingFrames.length < 256) this.pendingFrames.push(copy);
      return;
    }
    this.sendFrame(copy);
  }

  private sendFrame(frame: Int16Array): void {
    if (!this.port || this.stopped) return;
    const buffer = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength);
    // 不能带 transfer 列表：渲染层→主进程的 MessagePort 对"消息体含已 transfer 的 ArrayBuffer"
    // 会把整条消息序列化成 null（实测）；纯结构化克隆即可（4KB/帧 @12.5fps，开销可忽略）
    this.port.postMessage({ kind: "audio", format: "pcm", sampleRate: 16000, buffer });
  }

  // —— barge-in ——

  // 手动打断（页面「我要说话」按钮）：本地 VAD 被 AEC 压制时的保证性兜底
  manualInterrupt(): void {
    if (this.reconnecting || this.stopped) return;
    if (this.phase !== 'speaking' && this.phase !== 'thinking') return;
    void this.bargeIn();
  }
  private onLocalSpeechStart(): void {
    if (this.phase !== "speaking" && this.phase !== "thinking") return;
    if (this.reconnecting) return;
    void this.bargeIn();
  }

  // dropHeard：整段撤回当前回应（不保留已听前缀，用于语言纠正重答）；
  // forceChinese：重连后在 transcript 里带中文兜底指令，并由客户端主动 response.create
  private async bargeIn(opts: { dropHeard?: boolean; forceChinese?: boolean } = {}): Promise<void> {
    if (!this.port || !this.player) return;
    // response.done 后音频仍在本地播放：activeResponseId 已清空，此时按播放器正在播的响应打断
    const activeId = this.activeResponseId || this.player.currentResponseId();
    if (!activeId) return;
    const t0 = performance.now();
    this.reconnecting = true;
    this.setPhase("reconnecting");

    const heard = this.player.stop(activeId);
    const muteMs = performance.now() - t0;

    // best effort 通知服务端取消
    try { this.port.postMessage({ kind: "cancel" }); } catch { /* noop */ }
    this.interruptedIds.add(activeId);
    this.activeResponseId = null;

    const accum = this.responses[activeId];
    const fullText = accum ? stripRolePrefix(accum.text) : "";
    if (opts.dropHeard) {
      // 整段撤回：若完成轮已入列（response.done 先到）则移除，并把已落库行清为空打断轮
      const last = this.turns[this.turns.length - 1];
      if (last && last.role === "assistant" && fullText && last.text.trim() === fullText.trim()) {
        this.turns.pop();
        const doneKey = this.turnKeyByResponse[activeId];
        if (doneKey) {
          api.convUpdateTurn({ turnKey: doneKey, text: "", committedText: "", status: "interrupted" }).catch(() => {});
          this.persistedInterrupted.add(activeId);
        }
      }
      this.emitTurns();
    } else {
      // 固化被打断助手轮（仅已听前缀）
      const heardSamples = heard ? heard.heardSamples : 0;
      const totalSamples = heard ? heard.totalSamples : accum ? accum.audioSamples : 0;
      const prefix = heardPrefix(fullText, heardSamples, totalSamples);
      const idx = this.turns.findIndex((t) => t.role === "assistant" && t.text.trim() === fullText.trim() && fullText !== "");
      if (idx >= 0) this.turns[idx] = { role: "assistant", text: prefix, status: "interrupted" };
      else if (prefix) this.turns.push({ role: "assistant", text: prefix, status: "interrupted" });
      this.emitTurns();
      this.persistInterruptedTurn(activeId, prefix);
    }

    let contextTranscript = trimTranscriptToChars(buildContextTranscript(this.turns), MAX_CONTEXT_CHARS);
    if (opts.forceChinese) {
      contextTranscript += "\n(System: the learner's latest message above is in Chinese. Reply now following the Chinese fallback: first one short Chinese sentence confirming their meaning, then 你可以这样说：<natural English sentence>, then one English follow-up question.)";
    }

    // 重连后要补发的帧：普通打断=环形缓冲（用户开口的起始部分）；中文兜底=整轮语音重放
    this.pendingFrames = opts.forceChinese ? this.lastUtteranceFrames.slice() : this.ring.slice();

    const session = {
      input_audio_format: "wav",
      output_audio_format: "pcm",
      voice: "tongtong",
      turn_detection: { type: "server_vad" },
      beta_fields: { chat_mode: "audio", tts_source: "e2e" },
      // instructions 在 relay 侧由 buildContextInstructions 基于此值追加 transcript
      instructions: this.baseInstructions,
    };
    const replayed = this.waitForReplayed();
    this.port.postMessage({ kind: "reconnect", session, contextTranscript, createAfter: !!opts.forceChinese });
    try {
      await replayed;
    } catch {
      return; // failWaiters 已把相位恢复为聆听态；新响应到达时照常处理
    }

    // 补发缓冲帧（环形 + 重连期间采集）；语言纠正重答时无新语音，不补发
    const frames = this.pendingFrames;
    this.pendingFrames = [];
    if (!opts.forceChinese) for (const f of frames) this.sendFrame(f);
    this.reconnecting = false;
    this.lastBargeIn = { at: Date.now(), muteMs, replayMs: performance.now() - t0 };
    this.activeResponseId = null;
    this.setPhase("listening");
  }

  // 被打断的助手轮落库（仅已听前缀，committedText 同值供文本对话续聊引用）；
  // 播放期打断时该响应可能已作为 completed 落库（response.done 先到）——此时改写那一行为打断轮
  private persistInterruptedTurn(responseId: string, prefix: string) {
    if (!this.callSessionKey || this.persistedInterrupted.has(responseId)) return;
    this.persistedInterrupted.add(responseId);
    const doneKey = this.turnKeyByResponse[responseId];
    if (doneKey) {
      api.convUpdateTurn({
        turnKey: doneKey, text: prefix, committedText: prefix, status: "interrupted",
      }).catch(() => {});
      return;
    }
    if (!prefix.trim()) return;
    const turnKey = "callturn:" + crypto.randomUUID();
    this.turnKeyByResponse[responseId] = turnKey;
    api.convAddTurn({
      sessionKey: this.callSessionKey, turnKey, role: "assistant",
      text: prefix, committedText: prefix, status: "interrupted", provider: "realtime",
    }).catch(() => {});
  }

  private baseInstructions = "";

  // —— 中继消息 ——

  private onPortMessage(msg: unknown): void {
    if (!msg || typeof msg !== "object") return;
    const m = msg as { kind: string; [k: string]: unknown };
    switch (m.kind) {
      case "open":
        break;
      case "ready":
        this.readyFired = true;
        for (const w of this.readyWaiters.splice(0)) w.resolve();
        break;
      case "replayed":
        for (const w of this.replayedWaiters.splice(0)) w.resolve();
        break;
      case "audioDelta":
        this.onAudioDelta(m.responseId as string, m.buffer as ArrayBuffer);
        break;
      case "event":
        this.onServerEvent(m.event as { type: string; [k: string]: unknown });
        break;
      case "serverError":
        this.handlers.onError(`服务端错误${m.code ? " [" + m.code + "]" : ""}：${m.message || "未知错误"}`);
        // 未就绪阶段的拒绝（欠费/鉴权/参数）必须把 start() 放出来，否则页面卡「连接中」
        if (!this.readyFired) this.failWaiters(`服务端错误${m.code ? " [" + m.code + "]" : ""}：${m.message || ""}`);
        break;
      case "error":
        this.handlers.onError(String(m.message || "中继错误"));
        this.failWaiters(String(m.message || "中继错误"));
        break;
      case "closed": {
        const wasReconnecting = this.reconnecting;
        this.failWaiters("连接已断开");
        if (!this.stopped && !wasReconnecting) this.handlers.onError("连接已断开，请重新开始通话");
        break;
      }
      default:
        break;
    }
  }

  private onAudioDelta(responseId: string, buffer: ArrayBuffer): void {
    if (!this.player || !responseId) return;
    if (this.reconnecting) return;
    if (this.interruptedIds.has(responseId)) return; // 被打断响应的残余块，丢弃
    if (this.activeResponseId && responseId !== this.activeResponseId) return; // 旧响应残余，丢弃
    if (!this.activeResponseId) this.activeResponseId = responseId;
    this.responses = withAudioSamples(this.responses, responseId, buffer.byteLength >> 1);
    this.player.enqueue(responseId, buffer);
    if (this.speechStoppedAt) {
      // 记录 Server VAD 停说 → 首块音频的延迟（每轮首个 delta）
      if (this.serverToFirstAudioMs === null) this.serverToFirstAudioMs = performance.now() - this.speechStoppedAt;
    }
    if (this.phase !== "speaking") this.setPhase("speaking");
  }

  private onServerEvent(ev: { type: string; [k: string]: unknown }): void {
    switch (ev.type) {
      case "response.created": {
        const r = ev.response as { id?: string } | undefined;
        const id = r?.id || "";
        if (id) {
          this.responses = ensureResponse(this.responses, id);
          if (!this.activeResponseId) this.activeResponseId = id;
          this.serverToFirstAudioMs = null;
          if (this.phase === "listening") this.setPhase("thinking");
        }
        break;
      }
      case "response.audio_transcript.delta": {
        // 只累加音频转写流：端点会同时发 response.text.delta（同内容），双路都收会得到叠字文本
        const id = (ev.response_id as string) || this.activeResponseId || "";
        this.responses = withTextDelta(this.responses, id, String(ev.delta || ""));
        break;
      }
      case "input_audio_buffer.speech_started":
        this.utteranceFrames = [];
        // 服务端检测到用户开口：若本地 VAD 未触发，由此兜底 barge-in
        if ((this.phase === "speaking" || this.phase === "thinking") && !this.reconnecting) {
          void this.bargeIn();
        }
        break;
      case "input_audio_buffer.speech_stopped":
        this.speechStoppedAt = performance.now();
        // 截取本轮语音帧（含 speech_started 前的环形缓冲，保住开头）
        const merged = [...this.ring, ...this.utteranceFrames];
        this.lastUtteranceFrames = merged.slice(-300); // 上限 ~38s
        this.utteranceFrames = [];
        break;
      case "conversation.item.input_audio_transcription.completed": {
        // 中文兜底重放音频自己的转写不是新轮次，直接跳过（防级联取消 + 防重复入库）
        if (Date.now() < this.langFixSkipTransUntil) break;
        const transcript = String((ev as unknown as { transcript?: string }).transcript || "");
        const itemId = String((ev as unknown as { item_id?: string }).item_id || "");
        if (transcript && itemId !== this.lastUserItemId) {
          this.lastUserItemId = itemId;
          this.turns.push({ role: "user", text: transcript, status: "completed" });
          this.emitTurns();
          // 落库 + 用出证据检测（S13-b 口径与文本对话一致；失败不阻塞通话）
          if (this.callSessionKey) {
            const turnKey = "callturn:" + crypto.randomUUID();
            api.convAddTurn({
              sessionKey: this.callSessionKey, turnKey, role: "user",
              text: transcript, status: "user_confirmed", asrEngine: "server",
            }).catch(() => {});
            api.detectUsedAssets({
              sessionKey: this.callSessionKey, turnKey, text: transcript, prompted: [],
            }).catch(() => {});
          }
          // 中文兜底（确定性工程方案）：模型对"按输入语言切换"的指令遵循很差（实测整体倒向单一语言），
          // 由引擎按服务端转写判定——本轮为中文（汉字≥2 且明显多于字母，防 ASR 杂音汉字误触发）
          // 而正在生成的回应不含汉字时，撤回重答：重连（指令必然生效）→ 重放本轮语音 → 自动作答。
          // 重放期间置 reconnecting（屏蔽重放音频触发的 speech_started 打断），重放完成后补发缓冲帧。
          const cjkCount = (transcript.match(/[\u4e00-\u9fff]/g) || []).length;
          const letterCount = (transcript.match(/[A-Za-z]/g) || []).length;
          if (cjkCount >= 2 && cjkCount * 2 > letterCount && itemId !== this.lastLangFixItemId && Date.now() >= this.langFixUntil) {
            this.lastLangFixItemId = itemId;
            this.langFixUntil = Date.now() + 15_000;
            this.langFixSkipTransUntil = Date.now() + 6_000;
            const cur = this.activeResponseId;
            const curText = cur ? (this.responses[cur]?.text || "") : "";
            if (!this.reconnecting && !/[\u4e00-\u9fff]/.test(curText)) {
              void this.bargeIn({ dropHeard: true, forceChinese: true });
            }
          }
        }
        break;
      }
      case "response.done": {
        const id = (ev.response_id as string) || this.activeResponseId || "";
        this.responses = markDone(this.responses, id);
        // 打断/重连窗口内旧响应的 done 携带完整文本（cancel 不保证删除已生成内容）：
        // 已固化前缀的响应绝不允许整段复活（G3 对账 P0）
        if (this.interruptedIds.has(id) || this.reconnecting) break;
        const accum = this.responses[id];
        const text = accum ? stripRolePrefix(accum.text).trim() : "";
        if (text) {
          const last = this.turns[this.turns.length - 1];
          // 末轮已是同文本则不重复入列；barge-in 打断轮（interrupted）保留、新完成轮另入
          if (!last || last.role !== "assistant" || last.text.trim() !== text) {
            this.turns.push({ role: "assistant", text, status: "completed" });
            this.emitTurns();
            if (this.callSessionKey) {
              const turnKey = "callturn:" + crypto.randomUUID();
              this.turnKeyByResponse[id] = turnKey; // 播放期打断时需改写该行为 interrupted
              api.convAddTurn({
                sessionKey: this.callSessionKey, turnKey,
                role: "assistant", text, status: "completed", provider: "realtime",
              }).catch(() => {});
            }
          }
        }
        if (this.activeResponseId === id) this.activeResponseId = null;
        this.speechStoppedAt = 0;
        // 生成完 ≠ 播放完：本地音频仍在播时保持「AI 说话中」（打断窗口），播完由节拍器回聆听
        if (!this.reconnecting && !this.player?.isPlaying) this.setPhase("listening");
        break;
      }
      case "error": {
        const info = ev.error as { code?: string | number; message?: string } | undefined;
        const msg = `服务端错误${info?.code ? " [" + info.code + "]" : ""}：${info?.message || "未知错误"}`;
        this.handlers.onError(msg);
        if (!this.readyFired) this.failWaiters(msg);
        break;
      }
      default:
        break;
    }
  }

  // —— 挂断 ——

  async hangUp(): Promise<CallTurn[]> {
    this.stopped = true;
    if (this.heartbeatTimer !== null) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.phaseTimer !== null) { clearInterval(this.phaseTimer); this.phaseTimer = null; }
    try { this.port?.postMessage({ kind: "stop" }); } catch { /* noop */ }
    if (this.workletNode) { try { this.workletNode.disconnect(); } catch { /* noop */ } }
    if (this.micSource) { try { this.micSource.disconnect(); } catch { /* noop */ } }
    if (this.micStream) this.micStream.getTracks().forEach((t) => t.stop());
    if (this.micCtx) { try { await this.micCtx.close(); } catch { /* noop */ } }
    if (this.vad) { try { await this.vad.destroy(); } catch { /* noop */ } }
    if (this.player) { try { await this.player.close(); } catch { /* noop */ } }
    this.port = null;
    // 收口学习会话与对话会话（闭环；失败静默）
    const activeMs = this.startedAt ? Date.now() - this.startedAt : 0;
    if (this.learnKey) api.sessionClose(this.learnKey, activeMs, this.userTurnCount(), {}).catch(() => {});
    if (this.callSessionKey) {
      api.convClose({ sessionKey: this.callSessionKey, activeMs, status: "closed" }).catch(() => {});
    }
    return this.turns.slice();
  }
}
