// S9-0 数据契约：core.cjs 迁移 v11（五张新表+attempts.active_ms）、日界函数、deleteText 级联
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "core.cjs");
let s = fs.readFileSync(fp, "utf8");
const orig = s;
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip(已应用):", label); return; }
  if (!s.includes(oldStr)) throw new Error("未找到锚点: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}

// 1) MIGRATIONS 末尾追加 v11
rep(
`   CREATE INDEX IF NOT EXISTS idx_text_translations_text ON text_translations(text_id);\`,
];`,
`   CREATE INDEX IF NOT EXISTS idx_text_translations_text ON text_translations(text_id);\`,
  // v11：S9-0 数据契约——学习会话/恢复状态/漏网词相遇/覆盖率不可变快照/设置，考试前台活跃毫秒
  migrateV11,
];`,
"MIGRATIONS 追加 v11");

// 2) migrateV11 函数体（放在 migrateV7 之后）
rep(
`// v7 迁移体（独立函数，便于在事务内调用且可重入）
function migrateV7(db) {
  const cols = db.prepare("PRAGMA table_info(notes)").all().map((c) => c.name);
  if (!cols.includes("source")) {
    db.exec("ALTER TABLE notes ADD COLUMN source TEXT NOT NULL DEFAULT 'reading';");
  }
  db.exec(\`
    UPDATE notes SET source='concept' WHERE lexeme_id IN (SELECT id FROM lexemes WHERE pos='__concept__');
    UPDATE notes SET source='syllabus' WHERE source='reading' AND text_id IS NULL AND context_sentence LIKE '（从词表收录%';\`);
}`,
`// v7 迁移体（独立函数，便于在事务内调用且可重入）
function migrateV7(db) {
  const cols = db.prepare("PRAGMA table_info(notes)").all().map((c) => c.name);
  if (!cols.includes("source")) {
    db.exec("ALTER TABLE notes ADD COLUMN source TEXT NOT NULL DEFAULT 'reading';");
  }
  db.exec(\`
    UPDATE notes SET source='concept' WHERE lexeme_id IN (SELECT id FROM lexemes WHERE pos='__concept__');
    UPDATE notes SET source='syllabus' WHERE source='reading' AND text_id IS NULL AND context_sentence LIKE '（从词表收录%';\`);
}

// v11 迁移体（S9-0 数据契约；全部 IF NOT EXISTS/列检测，可重入、可在中断后重跑）
function migrateV11(db) {
  db.exec(\`
  CREATE TABLE IF NOT EXISTS app_settings(
    k TEXT PRIMARY KEY, v TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS learning_sessions(
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('read','shadow')),
    session_key TEXT NOT NULL UNIQUE,
    ref_type TEXT NOT NULL DEFAULT '',
    ref_id TEXT NOT NULL DEFAULT '',
    title_snapshot TEXT NOT NULL DEFAULT '',
    locator_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(locator_json)),
    content_hash TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL DEFAULT 0 CHECK(amount>=0),
    unit TEXT NOT NULL CHECK(unit IN ('words','sentences','')),
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    last_active_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','abandoned')),
    active_ms INTEGER NOT NULL DEFAULT 0 CHECK(active_ms>=0));
  CREATE INDEX IF NOT EXISTS idx_sessions_kind_start ON learning_sessions(kind, started_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_ref ON learning_sessions(ref_type, ref_id);
  CREATE TABLE IF NOT EXISTS resume_state(
    scope TEXT PRIMARY KEY,
    ref_id TEXT NOT NULL,
    locator_json TEXT NOT NULL CHECK(json_valid(locator_json)),
    content_hash TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS unknown_encounters(
    id INTEGER PRIMARY KEY,
    lemma TEXT NOT NULL, text_id INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 1 CHECK(count>=1),
    first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
    UNIQUE(lemma, text_id));
  CREATE INDEX IF NOT EXISTS idx_unknown_lemma ON unknown_encounters(lemma);
  CREATE INDEX IF NOT EXISTS idx_unknown_text ON unknown_encounters(text_id);
  CREATE TABLE IF NOT EXISTS coverage_assessments(
    id INTEGER PRIMARY KEY,
    text_id INTEGER,
    kind TEXT NOT NULL DEFAULT 'first_annotate' CHECK(kind IN ('first_annotate','parallel_test')),
    cefr TEXT NOT NULL DEFAULT '',
    total_tokens INTEGER NOT NULL DEFAULT 0 CHECK(total_tokens>=0),
    known_tokens INTEGER NOT NULL DEFAULT 0 CHECK(known_tokens>=0),
    rate REAL NOT NULL CHECK(rate>=0 AND rate<=1),
    snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
    created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_coverage_created ON coverage_assessments(created_at);\`);
  const atCols = db.prepare("PRAGMA table_info(attempts)").all().map((c) => c.name);
  if (!atCols.includes("active_ms")) {
    db.exec("ALTER TABLE attempts ADD COLUMN active_ms INTEGER NOT NULL DEFAULT 0;");
  }
}`,
"migrateV11 函数");

// 3) 日界函数（migrate() 之后）
rep(
`        v = i + 1;
      }
    }
  }

  // 挂载领域词包：`,
`        v = i + 1;
      }
    }
  }

  // S9-0：本地时区日界，全应用唯一实现（仪表盘日序列/连胜/日下钻统一调用）
  dayStart(ts = Date.now()) {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  dayKey(ts = Date.now()) {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return \`\${d.getFullYear()}-\${m}-\${dd}\`;
  }

  // 挂载领域词包：`,
"日界函数");

// 4) deleteText 级联新表（sessions 保留走墓碑）
rep(
`      db.prepare("DELETE FROM text_sources WHERE text_id=?").run(id);
      db.prepare("DELETE FROM text_translations WHERE text_id=?").run(id);`,
`      db.prepare("DELETE FROM text_sources WHERE text_id=?").run(id);
      db.prepare("DELETE FROM text_translations WHERE text_id=?").run(id);
      db.prepare("DELETE FROM unknown_encounters WHERE text_id=?").run(id);
      db.prepare("DELETE FROM resume_state WHERE scope='reading' AND ref_id=?").run(String(id));`,
"deleteText 级联");

if (s === orig) throw new Error("无修改");
fs.writeFileSync(fp, s, "utf8");
console.log(`完成 ${n} 处`);
