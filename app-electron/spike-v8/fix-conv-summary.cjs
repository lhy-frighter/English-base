const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(cp, "utf8");

const oldMethod = `  conversationSummary(sessionKey) {
    const turns = this.user.prepare(
      "SELECT turn_key FROM conversation_turns WHERE session_key=? AND role='user'").all(sessionKey);
    const turnKeys = turns.map((t) => t.turn_key);`;
const newMethod = `  conversationSummary(sessionKey) {
    const sess = this.user.prepare(
      "SELECT id FROM conversation_sessions WHERE session_key=?").get(sessionKey);
    const turns = sess ? this.user.prepare(
      "SELECT turn_key FROM conversation_turns WHERE session_id=? AND role='user'").all(sess.id) : [];
    const turnKeys = turns.map((t) => t.turn_key);`;
if (s.indexOf(oldMethod) === -1) throw new Error("method anchor missing");
s = s.replace(oldMethod, newMethod);
fs.writeFileSync(cp, s);
console.log("conversationSummary fixed");
