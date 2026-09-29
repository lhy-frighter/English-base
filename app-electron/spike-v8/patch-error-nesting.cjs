const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/realtime-relay.cjs";
let s = fs.readFileSync(p, "utf8");
const find = [
'    if (ev.type === "error") {',
'      this.post({ kind: "serverError", code: ev.code || "", message: ev.message || "" });',
'      this.log("warn", "server error code=" + ev.code);',
'      return;',
'    }',
].join("\n");
if (s.indexOf(find) < 0) throw new Error("anchor not found");
const repl = [
'    if (ev.type === "error") {',
'      const info = ev.error || {};',
'      this.post({ kind: "serverError", errorType: info.type || "", code: info.code || "", message: info.message || "" });',
'      this.log("warn", "server error type=" + info.type + " code=" + info.code + " msg=" + info.message);',
'      return;',
'    }',
].join("\n");
s = s.replace(find, repl);
fs.writeFileSync(p, s);
console.log("error nesting patched");
