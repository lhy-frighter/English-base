const fs = require("fs");
const fp = "core.cjs";
let s = fs.readFileSync(fp, "utf8");
let n = 0;

// 1) MIGRATIONS 注册 v13（锚点含反引号，用普通字符串）
if (!s.includes("migrateV13,")) {
  const anchor = "   CREATE INDEX IF NOT EXISTS idx_shadow_due ON shadow_sentences(status,due_at);`,\n];";
  if (!s.includes(anchor)) throw new Error("migrations tail anchor missing");
  const repl = "   CREATE INDEX IF NOT EXISTS idx_shadow_due ON shadow_sentences(status,due_at);`,\n  // v13：V8 对话——会话/轮次（状态机+播放游标），learning_sessions.kind 扩展 conversation\n  migrateV13,\n];";
  s = s.replace(anchor, repl);
  n++;
}

// 2) migrateV13 函数（放在 migrateV11 函数之后）
if (!s.includes("function migrateV13(")) {
  const anchor = `  const atCols = db.prepare("PRAGMA table_info(attempts)").all().map((c) => c.name);
  if (!atCols.includes("active_ms")) {
    db.exec("ALTER TABLE attempts ADD COLUMN active_ms INTEGER NOT NULL DEFAULT 0;");
  }
}`;
  if (!s.includes(anchor)) throw new Error("v11 fn tail anchor missing");
  const fn = anchor + `

// v13 迁移体（V8-0；可检测、可重入；每版迁移在同一事务内）
function migrateV13(db) {
  // learning_sessions.kind 扩展 conversation：检测现有 CHECK 是否已含，未含则表重建
  const lsRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='learning_sessions'").get();
  if (!lsRow || !lsRow.sql || !lsRow.sql.includes("'conversation'")) {
    db.exec(\`
    CREATE TABLE learning_sessions_v13(
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('read','shadow','conversation')),
      session_key TEXT NOT NULL UNIQUE,
      ref_type TEXT NOT NULL DEFAULT '',
      ref_id TEXT NOT NULL DEFAULT '',
      title_snapshot TEXT NOT NULL DEFAULT '',
      locator_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(locator_json)),
      content_hash TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL DEFAULT 0 CHECK(amount>=0),
      unit TEXT NOT NULL CHECK(unit IN ('words','sentences','turns','')),
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      last_active_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','abandoned')),
      active_ms INTEGER NOT NULL DEFAULT 0 CHECK(active_ms>=0));
    INSERT INTO learning_sessions_v13
      SELECT id, kind, session_key, ref_type, ref_id, title_snapshot, locator_json,
             content_hash, amount, unit, started_at, ended_at, last_active_at, status, active_ms
      FROM learning_sessions;
    DROP TABLE learning_sessions;
    ALTER TABLE learning_sessions_v13 RENAME TO learning_sessions;
    CREATE INDEX IF NOT EXISTS idx_sessions_kind_start ON learning_sessions(kind, started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_ref ON learning_sessions(ref_type, ref_id);\`);
  }
  db.exec(\`
  CREATE TABLE IF NOT EXISTS conversation_sessions(
    id INTEGER PRIMARY KEY,
    session_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    topic_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(topic_json)),
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    last_active_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('open','closed','abandoned')),
    active_ms INTEGER NOT NULL DEFAULT 0 CHECK(active_ms>=0),
    brain_engine TEXT NOT NULL DEFAULT '',
    brain_model_revision TEXT NOT NULL DEFAULT '',
    augmented INTEGER NOT NULL DEFAULT 0 CHECK(augmented IN (0,1)),
    cefr_at_start TEXT NOT NULL DEFAULT '',
    turns_count INTEGER NOT NULL DEFAULT 0 CHECK(turns_count>=0));
  CREATE INDEX IF NOT EXISTS idx_conv_session_status ON conversation_sessions(status, started_at);
  CREATE TABLE IF NOT EXISTS conversation_turns(
    id INTEGER PRIMARY KEY,
    turn_key TEXT NOT NULL UNIQUE,
    session_id INTEGER NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL CHECK(seq>=0),
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    status TEXT NOT NULL CHECK(status IN
      ('user_draft','user_confirmed','generating','speaking','completed','interrupted','failed')),
    text TEXT NOT NULL DEFAULT '',
    committed_text TEXT NOT NULL DEFAULT '',
    played_char_end INTEGER,
    provider TEXT NOT NULL DEFAULT '',
    model_revision TEXT NOT NULL DEFAULT '',
    asr_engine TEXT NOT NULL DEFAULT '',
    asr_model TEXT NOT NULL DEFAULT '',
    edited INTEGER NOT NULL DEFAULT 0 CHECK(edited IN (0,1)),
    audio_ref TEXT NOT NULL DEFAULT '',
    local_feedback_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(local_feedback_json)),
    cloud_feedback_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cloud_feedback_json)),
    augment_status TEXT NOT NULL DEFAULT 'pending' CHECK(augment_status IN ('pending','done','skipped')),
    interrupted_at INTEGER,
    error_code TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    UNIQUE(session_id, seq));
  CREATE INDEX IF NOT EXISTS idx_conv_turns_session ON conversation_turns(session_id, seq);
  CREATE INDEX IF NOT EXISTS idx_conv_turns_status ON conversation_turns(status);\`);
}`;
  s = s.replace(anchor, fn);
  n++;
}

// 3) 导出 MIGRATIONS（供迁移测试构造旧版本夹具）
{
  const anchor = "module.exports = { Core, extractSentence, buildCloze, nowMs, NEW_PER_DAY, parsePaper, decodeHtmlEntities };";
  if (!s.includes("MIGRATIONS,")) {
    s = s.replace(anchor, 'module.exports = { Core, MIGRATIONS, extractSentence, buildCloze, nowMs, NEW_PER_DAY, parsePaper, decodeHtmlEntities };');
    n++;
  }
}

fs.writeFileSync(fp, s, "utf8");
console.log("v13 migration added, edits:", n);
