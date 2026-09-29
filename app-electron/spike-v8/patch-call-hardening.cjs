const fs = require("node:fs");

// ========== 1) call-engine.ts ==========
const ep = "D:/vibe coding/英语学习/app-electron/src/call/call-engine.ts";
let e = fs.readFileSync(ep, "utf8");

// 1a) 环形缓冲 4 帧(512ms) → 8 帧(1024ms)，覆盖 VAD 确认延迟，避免打断开口被截
e = e.replace(
  'const RING_FRAMES = 4; // ~512ms 环形缓冲，重连后补发用户开口的起始部分',
  'const RING_FRAMES = 8; // ~1024ms 环形缓冲，覆盖 VAD 确认延迟，重连后补发用户开口的起始部分'
);

// 1b) 指令：中文兜底强制中文回答 + 语法/时态错误必纠
const oldRules = `    "- If the learner speaks Chinese because they don't know how to say something, briefly explain in Chinese how to express it naturally in English, then give the English sentence and continue in English.",
    "- Gently correct only errors that block meaning; do not interrupt the flow with lectures.",`;
const newRules = `    "- If the learner's message contains ANY Chinese (even one Chinese word mixed into English), you MUST first reply in 简体中文: briefly explain the natural English way to say it, then give the full English sentence, then continue in English. Never answer a Chinese question only in English.",
    "- When you notice a grammar, tense, or word-form error (e.g. 'Yesterday I go'), briefly correct it in one line: say 'Say: <corrected sentence>', then continue naturally. You may explain the rule in Chinese. Do not give long lectures.",`;
if (!e.includes(oldRules)) { console.log("RULES NOT FOUND"); process.exit(1); }
e = e.replace(oldRules, newRules);

// 1c) 暴露手动打断入口（AI 外放压制 VAD 时的兜底保证）
const anchor = "  private onLocalSpeechStart(): void {";
const manual = [
  "  // 手动打断（页面「我要说话」按钮）：本地 VAD 被 AEC 压制时的保证性兜底",
  "  manualInterrupt(): void {",
  "    if (this.reconnecting || this.stopped) return;",
  "    if (this.phase !== 'speaking' && this.phase !== 'thinking') return;",
  "    void this.bargeIn();",
  "  }",
  "",
].join("\n");
if (!e.includes(anchor)) { console.log("ANCHOR NOT FOUND"); process.exit(1); }
e = e.replace(anchor, manual + anchor);

fs.writeFileSync(ep, e);
console.log("call-engine patched");

// ========== 2) VoiceCallPage.tsx：AI 说话/思考时显示「我要说话」按钮 ==========
const vp = "D:/vibe coding/英语学习/app-electron/src/VoiceCallPage.tsx";
let v = fs.readFileSync(vp, "utf8");

const oldBar = `          <strong>{PHASE_LABEL[phase]}</strong>
          <button className="btn-primary vcall-hangup" onClick={() => void hangUp()}>挂断</button>`;
const newBar = `          <strong>{PHASE_LABEL[phase]}</strong>
          {(phase === "speaking" || phase === "thinking") && (
            <button className="btn-mini vcall-talkbtn" onClick={() => engineRef.current?.manualInterrupt()}>✋ 我要说话</button>
          )}
          <button className="btn-primary vcall-hangup" onClick={() => void hangUp()}>挂断</button>`;
if (!v.includes(oldBar)) { console.log("BAR NOT FOUND"); process.exit(1); }
v = v.replace(oldBar, newBar);
fs.writeFileSync(vp, v);
console.log("VoiceCallPage patched");
