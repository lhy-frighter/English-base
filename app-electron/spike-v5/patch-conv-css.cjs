const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/src/styles.css";
const css = `
/* =====================================================================
   V8-2b 对话页
   ===================================================================== */
.conv-setup { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; align-items: start; }
.conv-form, .conv-history { padding: 18px 20px; }
.conv-form h3, .conv-history h3 { margin: 0 0 12px; color: var(--ink); }
.conv-label { display: block; font-size: 12px; color: var(--ink-3); margin: 12px 0 6px; }
.conv-input {
  width: 100%; padding: 9px 12px; font-size: 14px;
  border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink-2);
}
.conv-input:focus { outline: none; border-color: var(--indigo); }
.conv-presets { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 4px; }
.chip.chip-on { background: var(--ink); border-color: var(--ink); color: #f0ecdf; font-weight: 600; }
.conv-row { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 4px; }
.conv-start { margin-top: 18px; width: 100%; }
.conv-hist-item {
  display: flex; flex-direction: column; gap: 4px; text-align: left;
  width: 100%; padding: 10px 12px; margin-bottom: 8px;
  background: var(--surface); border: 1px solid var(--line); border-radius: 9px;
}
.conv-hist-item:hover { border-color: var(--brass); background: var(--brass-wash); }
.conv-hist-item b { font-size: 13.5px; color: var(--ink); }
.conv-hist-item span { font-size: 11.5px; color: var(--ink-3); }

.conv-chat-page { display: flex; flex-direction: column; height: 100%; }
.conv-chat-head { position: sticky; top: 0; z-index: 5; background: var(--paper); padding-top: 10px; }
.conv-chat-head h2 { margin: 0; font-size: 17px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-end { white-space: nowrap; }
.conv-loading { margin: 8px 0; font-size: 13px; color: var(--ink-3); }
.conv-loading .prog-track { margin-top: 6px; }
.conv-messages { flex: 1; overflow-y: auto; padding: 10px 4px 16px; display: flex; flex-direction: column; gap: 14px; }
.conv-msg { display: flex; flex-direction: column; max-width: 78%; }
.conv-user { align-self: flex-end; align-items: flex-end; }
.conv-assistant { align-self: flex-start; }
.conv-bubble {
  padding: 10px 14px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
  border-radius: 12px;
}
.conv-user .conv-bubble { background: var(--indigo); color: #f3f1e8; border-bottom-right-radius: 4px; }
.conv-assistant .conv-bubble { background: var(--surface); border: 1px solid var(--line); border-bottom-left-radius: 4px; color: var(--ink-2); }
.conv-correction {
  margin-top: 6px; font-size: 12px; line-height: 1.5; color: var(--brass);
  background: var(--brass-wash); border-radius: 8px; padding: 5px 10px;
}
.conv-input-bar { display: flex; gap: 10px; padding: 10px 0 4px; border-top: 1px solid var(--line); }
.conv-input-bar .conv-input { flex: 1; }
`;
fs.appendFileSync(p, css.replace(/\n/g, "\r\n"));
console.log("conversation css appended");
