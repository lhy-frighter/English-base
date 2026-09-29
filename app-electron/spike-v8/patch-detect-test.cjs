const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/debrief.cjs";
let s = fs.readFileSync(tp, "utf8");
if (s.indexOf("用出检测：spontaneous") !== -1) { console.log("already"); process.exit(0); }

const anchor = `console.log(\`\\ndebrief: \${pass} passed, \${fail} failed\`);
process.exit(fail ? 1 : 0);`;
if (s.indexOf(anchor) === -1) throw new Error("anchor missing");

const add = `// —— 6. detectUsedAssets 用出证据三分类 ——
const mkSession = (key) => {
  const t = Date.now();
  db.prepare(\`INSERT INTO conversation_sessions
    (session_key,title,topic_json,started_at,last_active_at,status,active_ms,cefr_at_start,turns_count)
    VALUES(?,?,?,?,?,?,?,?,?)\`)
    .run(key, key, "{}", t, t, "open", 0, "B1", 0);
  return db.prepare("SELECT id FROM conversation_sessions WHERE session_key=?").get(key).id;
};
const addAsst = (sessId, seq, feedback, text) =>
  db.prepare(\`INSERT INTO conversation_turns
    (session_id,seq,turn_key,role,text,status,committed_text,local_feedback_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)\`)
    .run(sessId, seq, "a" + seq + ":" + sessId, "assistant", text, "completed", text,
      JSON.stringify(feedback), Date.now());

// 6.1 spontaneous：无纠错前情，用户自然用出 chunk
const s2 = mkSession("sess-2");
const det1 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-1", text: "I look forward to seeing you",
});
check("用出检测：spontaneous chunk",
  det1.some((d) => d.result === "used_spontaneously"), JSON.stringify(det1));

// 6.2 每会话同类证据至多一条（再用出 → replayed）
const det2 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-2", text: "I look forward to it too",
});
check("用出检测：同会话重复 → replayed",
  det2.every((d) => d.replayed === true), JSON.stringify(det2));

// 6.3 中文轮不评估
const det3 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-3", text: "我期待这个",
});
check("用出检测：中文轮空", det3.length === 0);

// 6.4 after_correction：上一条 assistant 纠错含该 chunk
const s4 = mkSession("sess-4");
addAsst(s4, 0, [{ correction: "You should say: I look forward to it." }],
  "Try: I look forward to it.");
const det4 = core.detectUsedAssets({
  sessionKey: "sess-4", turnKey: "u4-1", text: "I look forward to it",
});
check("用出检测：纠正后立即重说 → after_correction",
  det4.some((d) => d.result === "used_after_correction"), JSON.stringify(det4));

// 6.5 单词边界：word 资产 "art" 不命中 party
db.prepare(\`INSERT INTO learning_assets
  (asset_kind,canonical,gloss,payload_json,identity_key,status,created_at,idempotency_key)
  VALUES('word','art','艺术','{}','lex:art','active',?,?)\`)
  .run(Date.now(), "word-art-1");
const det5 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-4", text: "the party was fun",
});
check("用出检测：单词边界（art 不命中 party）",
  !det5.some((d) => d.asset_id === db.prepare(
    "SELECT id FROM learning_assets WHERE identity_key='lex:art'").get().id));
const det6 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-5", text: "modern art is amazing",
});
check("用出检测：art 正确命中", det6.some((d) => {
  const id = db.prepare("SELECT id FROM learning_assets WHERE identity_key='lex:art'").get().id;
  return d.asset_id === id && d.result === "used_spontaneously";
}), JSON.stringify(det6));

// 6.6 中英混说：英文片段仍评估 chunk
const det7 = core.detectUsedAssets({
  sessionKey: "sess-2", turnKey: "u2-6", text: "我很 look forward to 明天",
});
check("用出检测：中英混说英文片段评估",
  det7.some((d) => d.replayed === true || d.result === "used_spontaneously"),
  JSON.stringify(det7));

` + anchor;
s = s.replace(anchor, add);
fs.writeFileSync(tp, s);
console.log("patched");
