const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/styles.css";
let css = fs.readFileSync(p, "utf8");
const block = `
/* ===== S14-1C 语音通话 ===== */
.vcall-live { display: flex; flex-direction: column; height: 100%; padding: 0; }
.vcall-bar { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--border, #e5e7eb); background: var(--card, #fff); position: sticky; top: 0; z-index: 5; }
.vcall-bar strong { font-size: 14px; }
.vcall-hangup { margin-left: auto; }
.vcall-dot { width: 10px; height: 10px; border-radius: 50%; background: #9ca3af; flex: none; }
.vcall-dot-listening { background: #22c55e; box-shadow: 0 0 0 4px rgba(34,197,94,.15); }
.vcall-dot-thinking { background: #f59e0b; }
.vcall-dot-speaking { background: #3b82f6; box-shadow: 0 0 0 4px rgba(59,130,246,.15); }
.vcall-dot-reconnecting, .vcall-dot-connecting { background: #a855f7; }
.vcall-scroll { flex: 1; overflow-y: auto; padding: 20px 18px; display: flex; flex-direction: column; gap: 12px; }
.vcall-hint { text-align: center; margin-top: 40px; font-size: 13px; }
.vcall-bubble { max-width: 78%; padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
.vcall-bubble-user { align-self: flex-end; background: #3b82f6; color: #fff; border-bottom-right-radius: 4px; }
.vcall-bubble-ai { align-self: flex-start; background: var(--card2, #f3f4f6); border-bottom-left-radius: 4px; }
.vcall-cut { display: block; font-size: 11px; opacity: .75; margin-top: 4px; font-style: normal; }
.vcall-foot { border-top: 1px solid var(--border, #e5e7eb); padding: 10px 18px; background: var(--card, #fff); display: flex; align-items: center; gap: 14px; }
.vcall-meter { width: 160px; height: 8px; border-radius: 4px; background: var(--card2, #eef0f3); overflow: hidden; flex: none; }
.vcall-meter-fill { height: 100%; background: linear-gradient(90deg,#34d399,#3b82f6); transition: width .12s linear; }
.vcall-stats { font-size: 11px; white-space: nowrap; }
.vcall-err { margin: 8px 18px 12px; }
`;
css += block;
fs.writeFileSync(p, css);
console.log("vcall styles appended");
