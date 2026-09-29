const fs = require("node:fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");

const anchor = `  // 启动回收：open 且 last_active 早于 10 分钟前 → abandoned，ended_at 补 last_active+一个刷新周期(20s)`;
if (!s.includes(anchor)) { console.error("anchor missing"); process.exit(1); }

const block = `  // —— V8-2b 对话会话与轮次（七态状态机；turn_key 幂等）——
  _convSessionDto(r) {
    if (!r) return null;
    return {
      id: r.id, sessionKey: r.session_key, title: r.title,
      topic: JSON.parse(r.topic_json || "{}"),
      startedAt: r.started_at, endedAt: r.ended_at, lastActiveAt: r.last_active_at,
      status: r.status, activeMs: r.active_ms,
      brainEngine: r.brain_engine, brainModelRevision: r.brain_model_revision,
      augmented: r.augmented, cefrAtStart: r.cefr_at_start, turnsCount: r.turns_count,
    };
  }

  _convTurnDto(r) {
    if (!r) return null;
    return {
      id: r.id, turnKey: r.turn_key, sessionId: r.session_id, seq: r.seq,
      role: r.role, status: r.status, text: r.text, committedText: r.committed_text,
      playedCharEnd: r.played_char_end, provider: r.provider, modelRevision: r.model_revision,
      asrEngine: r.asr_engine, asrModel: r.asr_model, edited: r.edited, audioRef: r.audio_ref,
      localFeedback: JSON.parse(r.local_feedback_json || "[]"),
      cloudFeedback: JSON.parse(r.cloud_feedback_json || "[]"),
      augmentStatus: r.augment_status, interruptedAt: r.interrupted_at,
      errorCode: r.error_code, createdAt: r.created_at,
    };
  }

  convCreate(o = {}) {
    const topic = {
      goal: String(o.goal || "").slice(0, 500),
      cefr: String(o.cefr || "B2"),
      suggestedTurns: Math.max(2, Math.min(40, Number(o.suggestedTurns) || 8)),
    };
    if (!topic.goal) throw new Error("请填写话题目标");
    const key = String(o.sessionKey || \`conv:\${crypto.randomUUID()}\`);
    const existing = this.user.prepare("SELECT * FROM conversation_sessions WHERE session_key=?").get(key);
    if (existing) return this._convSessionDto(existing);
    const t = nowMs();
    this.user.prepare(\`INSERT INTO conversation_sessions
      (session_key,title,topic_json,started_at,last_active_at,status,active_ms,brain_engine,brain_model_revision,augmented,cefr_at_start,turns_count)
      VALUES (?,?,?,?,?,'open',0,?,?,0,?,0)\`)
      .run(key, topic.goal.slice(0, 200), JSON.stringify(topic), t, t,
        String(o.brainEngine || "local"), String(o.brainModelRevision || ""), topic.cefr);
    return this._convSessionDto(this.user.prepare("SELECT * FROM conversation_sessions WHERE session_key=?").get(key));
  }

  convList(limit = 20) {
    return this.user.prepare("SELECT * FROM conversation_sessions ORDER BY started_at DESC LIMIT ?")
      .all(Math.max(1, Math.min(100, Number(limit) || 20)))
      .map((r) => this._convSessionDto(r));
  }

  convGet(sessionKey) {
    const row = this.user.prepare("SELECT * FROM conversation_sessions WHERE session_key=?").get(String(sessionKey));
    if (!row) return null;
    const turns = this.user.prepare("SELECT * FROM conversation_turns WHERE session_id=? ORDER BY seq ASC")
      .all(row.id).map((r) => this._convTurnDto(r));
    return { session: this._convSessionDto(row), turns };
  }

  convAddTurn(o = {}) {
    const key = String(o.turnKey || \`turn:\${crypto.randomUUID()}\`);
    const existing = this.user.prepare("SELECT * FROM conversation_turns WHERE turn_key=?").get(key);
    if (existing) return this._convTurnDto(existing);
    const sess = this.user.prepare("SELECT * FROM conversation_sessions WHERE session_key=?").get(String(o.sessionKey));
    if (!sess) throw new Error("对话会话不存在");
    const role = o.role === "assistant" ? "assistant" : "user";
    const status = String(o.status || (role === "user" ? "user_confirmed" : "generating"));
    const seq = Number.isInteger(Number(o.seq)) ? Number(o.seq)
      : this.user.prepare("SELECT COALESCE(MAX(seq),-1)+1 AS n FROM conversation_turns WHERE session_id=?").get(sess.id).n;
    const t = nowMs();
    this.user.prepare(\`INSERT INTO conversation_turns
      (turn_key,session_id,seq,role,status,text,committed_text,provider,model_revision,asr_engine,asr_model,edited,audio_ref,local_feedback_json,cloud_feedback_json,augment_status,interrupted_at,error_code,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,NULL,'[]','[]','pending',NULL,NULL,?)\`)
      .run(key, sess.id, seq, role, status, String(o.text || ""), String(o.committedText || ""),
        String(o.provider || ""), String(o.modelRevision || ""), String(o.asrEngine || ""), String(o.asrModel || ""), t);
    this.user.prepare(
      "UPDATE conversation_sessions SET last_active_at=?, turns_count=(SELECT COUNT(*) FROM conversation_turns WHERE session_id=? AND role='user') WHERE id=?")
      .run(t, sess.id, sess.id);
    return this._convTurnDto(this.user.prepare("SELECT * FROM conversation_turns WHERE turn_key=?").get(key));
  }

  convUpdateTurn(o = {}) {
    const row = this.user.prepare("SELECT * FROM conversation_turns WHERE turn_key=?").get(String(o.turnKey));
    if (!row) throw new Error("轮次不存在");
    const map = {
      status: ["status", (v) => String(v)],
      text: ["text", (v) => String(v)],
      committedText: ["committed_text", (v) => String(v)],
      playedCharEnd: ["played_char_end", (v) => Math.max(0, Math.floor(Number(v)))],
      errorCode: ["error_code", (v) => String(v)],
      interruptedAt: ["interrupted_at", (v) => Math.floor(Number(v))],
      provider: ["provider", (v) => String(v)],
      modelRevision: ["model_revision", (v) => String(v)],
      audioRef: ["audio_ref", (v) => String(v)],
      localFeedback: ["local_feedback_json", (v) => JSON.stringify(Array.isArray(v) ? v : [])],
      cloudFeedback: ["cloud_feedback_json", (v) => JSON.stringify(Array.isArray(v) ? v : [])],
      augmentStatus: ["augment_status", (v) => String(v)],
      edited: ["edited", (v) => (v ? 1 : 0)],
    };
    const sets = []; const vals = [];
    for (const [k, [col, fn]] of Object.entries(map)) {
      if (o[k] !== undefined) { sets.push(\`\${col}=?\`); vals.push(fn(o[k])); }
    }
    if (sets.length) {
      vals.push(row.id);
      this.user.prepare(\`UPDATE conversation_turns SET \${sets.join(",")} WHERE id=?\`).run(...vals);
    }
    return this._convTurnDto(this.user.prepare("SELECT * FROM conversation_turns WHERE id=?").get(row.id));
  }

  convClose(o = {}) {
    const row = this.user.prepare("SELECT * FROM conversation_sessions WHERE session_key=?").get(String(o.sessionKey));
    if (!row) return null;
    if (row.status === "open") {
      const t = nowMs();
      const activeMs = Math.max(row.active_ms, Math.max(0, Math.floor(Number(o.activeMs) || 0)));
      const status = o.status === "abandoned" ? "abandoned" : "closed";
      this.user.prepare("UPDATE conversation_sessions SET status=?, ended_at=?, active_ms=?, last_active_at=? WHERE id=?")
        .run(status, t, activeMs, t, row.id);
    }
    return this._convSessionDto(this.user.prepare("SELECT * FROM conversation_sessions WHERE id=?").get(row.id));
  }

`;

s = s.replace(anchor, block + anchor);
fs.writeFileSync(p, s);
console.log("conversation core methods inserted");
