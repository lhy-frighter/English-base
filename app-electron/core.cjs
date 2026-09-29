// core.cjs — 用户数据 + 标注管线 + FSRS 调度（Electron 主进程用）
// 算法与 Rust 版 lib.rs / V0 预演脚本保持一致；纯 JS，无原生模块（智能应用控制友好）。
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  fsrs, generatorParameters, createEmptyCard, State, Rating,
} = require("ts-fsrs");
const { AWL } = require("./awl-data.cjs");
const { MIGRATION_V8, FeedManager } = require("./feeds.cjs");
// AWL 词形 → 词族（头词+全部词族成员，含英美归一）；标注与学术牌组共用
const AWL_BY_FORM = new Map();
for (const fam of AWL) {
  AWL_BY_FORM.set(fam.h, fam);
  for (const f of fam.f) if (!AWL_BY_FORM.has(f)) AWL_BY_FORM.set(f, fam);
}

// 封闭类功能词：不进漏网词相遇表（冠词/代词/介词/连词/助动词/封闭副词）
const FUNCTION_WORDS = new Set(["a","an","the","this","that","these","those","be","is","are","was","were","been","am","being","do","does","did","done","doing","have","has","had","having","will","would","shall","should","can","could","may","might","must","ought","need","dare","used","i","me","my","mine","we","us","our","ours","you","your","yours","he","him","his","she","her","hers","it","its","they","them","their","theirs","myself","yourself","himself","herself","itself","ourselves","yourselves","themselves","who","whom","whose","which","what","everyone","everybody","everything","someone","somebody","something","anyone","anybody","anything","noone","nobody","nothing","all","any","both","each","few","more","most","other","others","some","such","none","neither","either","every","several","many","much","of","in","on","at","to","for","from","with","by","about","into","through","during","before","after","above","below","between","under","over","across","along","around","behind","beside","among","amongst","upon","within","without","near","onto","off","up","down","out","via","per","versus","amid","amidst","despite","except","till","until","toward","towards","against","throughout","and","or","but","nor","so","yet","if","then","else","when","whenever","where","wherever","why","how","while","although","though","because","since","unless","whether","as","than","once","whereas","nevertheless","nonetheless","not","no","now","then","here","there","always","never","often","sometimes","usually","rarely","seldom","ever","very","too","also","just","only","even","still","already","again","almost","quite","rather","perhaps","maybe","indeed","thus","therefore","however","moreover","furthermore","otherwise","likewise","instead","anyway"]);
const FUNCTION_POS_RE = /^\s*(art|prep|conj|pron|det|int|interj|num|modal|aux|part|abbr)\./i;
const DAY_MS = 86_400_000;
const REQUEST_RETENTION = 0.9;
const NEW_PER_DAY = 12;
const BACKUP_KEEP = 7;
// 本地日期戳 YYYY-MM-DD（备份文件命名按用户本地天）
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// 分页偏移钳制为安全整数：offset 会被插进 SQL 文本（LIMIT/OFFSET），
// Number("1e400")=Infinity、"2.5" 之类原样插值会让 SQLite 抛 "no such column: Infinity"/datatype mismatch
function pageOffset(v) {
  const n = Math.floor(Number(v));
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}
// 考纲牌组：ECDICT tag 字段（空格分隔多标签）→ 中文名；顺序即展示顺序
const SYLLABUS_TAGS = [
  ["zk", "中考"], ["gk", "高考"], ["cet4", "四级"], ["cet6", "六级"],
  ["ky", "考研"], ["ielts", "雅思"], ["toefl", "托福"], ["gre", "GRE"],
  ["awl", "学术AWL"],
];
const SYLLABUS_PAGE = 100;
const LEXEME_PAGE = 100;
// 考纲等级阶梯（由低到高）；词元等级=其 ECDICT tag 中最高的一档
const LEVEL_LADDER = ["zk", "gk", "cet4", "cet6", "ky", "ielts", "toefl", "gre"];
const LEVEL_LABEL = { zk: "中考", gk: "高考", cet4: "四级", cet6: "六级", ky: "考研", ielts: "雅思", toefl: "托福", gre: "GRE" };
function levelOfTag(tag) {
  const have = " " + (tag || "") + " ";
  for (let i = LEVEL_LADDER.length - 1; i >= 0; i--) {
    if (have.includes(" " + LEVEL_LADDER[i] + " ")) return LEVEL_LADDER[i];
  }
  return "";
}
// Latin 字母（ASCII + Latin-1 Supplement + Latin Extended-A/B，覆盖 ŁłÇçĞğŞşéàâ 等），×÷ 除外
const LAT = "A-Za-zÀ-ÖØ-öø-ɏ";
const WORD_RE = new RegExp(`[${LAT}]+(?:['’\\-][${LAT}]+)*|[${LAT}]*[0-9][${LAT}0-9\\-]*`, "g");
const CAP_RE = /\p{Lu}/u; // 任意语言的大写字母（含 Ł Ç Ğ Ş İ 等 Latin Extended 大写）
// 邮箱 / URL：论文页眉与参考文献里的地址不作为生词（如 Łukasz 的邮箱柄 lukaszkaiser）
const NEUTRAL_SPAN_RE = /[A-Za-z0-9._%+\-À-ÖØ-öø-ɏ]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}|https?:\/\/\S+|www\.\S+/g;
// 连字符家族（ASCII hyphen、Armenian、Unicode 各种 dash/hyphen、减号）→ MWE 归一时统一当空格
const HYPHEN_RE = /[\u002D\u058A\u2010-\u2015\u2212]/g;
const HYPHEN_TEST = /[\u002D\u058A\u2010-\u2015\u2212]/;
function normPhrase(s) {
  return String(s).toLowerCase().replace(HYPHEN_RE, " ").replace(/\s+/g, " ").trim();
}
const CONTRACTIONS = new Set(["s", "t", "re", "ve", "ll", "d", "m"]);
// S8：弯引号（左/右单引号、修饰字母撇号）在解析键上归一为 ASCII 撇号；只用于查词，不改展示文本
const APOSTROPHE_TEST = /[‘’ʼ]/;
const normApos = (s) => (APOSTROPHE_TEST.test(s) ? s.replace(/[‘’ʼ]/g, "'") : s);
// S8：n't 不规则缩约 → 助动词词头（规则缩约 's/'re/'ve/'ll/'d/'m 走 CONTRACTIONS 截尾）
const NT_EXPAND = new Map([
  ["didn't", "did"], ["doesn't", "does"], ["don't", "do"],
  ["isn't", "is"], ["aren't", "are"], ["wasn't", "was"], ["weren't", "were"],
  ["hasn't", "has"], ["haven't", "have"], ["hadn't", "had"],
  ["couldn't", "could"], ["wouldn't", "would"], ["shouldn't", "should"],
  ["mightn't", "might"], ["mustn't", "must"], ["needn't", "need"],
  ["oughtn't", "ought"], ["shan't", "shall"], ["won't", "will"], ["can't", "can"],
]);
// S6：文章来源类型白名单（text_sources.kind）
const TEXT_SOURCE_KINDS = ["builtin", "feed", "url", "file", "paste", "extension"];
const STOP = new Set(("a an the and or but if of to in on at by for with from as is are was were be been being am do does did have has had will would can could shall should may might must that this these those it its he she they them his her their we us our you your i me my my not no nor so too very than then there here what which who whom when where why how all each both some any few more most other such only own same just also into over under again about between through during before after above below up down out off once per upon while").split(" "));

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS texts(
    id INTEGER PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
    raw_text TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS lexemes(
    id INTEGER PRIMARY KEY, lemma TEXT NOT NULL, pos TEXT NOT NULL DEFAULT '',
    sense TEXT NOT NULL DEFAULT '', tag TEXT NOT NULL DEFAULT '',
    bnc INTEGER NOT NULL DEFAULT 0, frq INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, UNIQUE(lemma, pos, sense));
  CREATE TABLE IF NOT EXISTS notes(
    id INTEGER PRIMARY KEY, lexeme_id INTEGER NOT NULL REFERENCES lexemes(id),
    text_id INTEGER REFERENCES texts(id), context_sentence TEXT NOT NULL,
    created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS cards(
    id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES notes(id),
    card_type TEXT NOT NULL, due INTEGER NOT NULL, state INTEGER NOT NULL DEFAULT 0,
    stability REAL, difficulty REAL, reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0, last_review INTEGER,
    created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due, state);
  CREATE TABLE IF NOT EXISTS review_log(
    id INTEGER PRIMARY KEY, card_id INTEGER NOT NULL REFERENCES cards(id),
    rated_at INTEGER NOT NULL, rating INTEGER NOT NULL,
    last_ivl INTEGER NOT NULL DEFAULT 0, ivl INTEGER NOT NULL DEFAULT 0,
    elapsed_ms INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS idx_review_log_card ON review_log(card_id);
  CREATE TABLE IF NOT EXISTS evidence_log(
    id INTEGER PRIMARY KEY, lexeme_id INTEGER NOT NULL REFERENCES lexemes(id),
    dimension TEXT NOT NULL, result TEXT NOT NULL, source_type TEXT NOT NULL,
    source_ref TEXT NOT NULL DEFAULT '', card_id INTEGER, created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_evidence_lexeme ON evidence_log(lexeme_id);`,
  `ALTER TABLE texts ADD COLUMN norm_text TEXT;
   UPDATE texts SET norm_text = LOWER(REPLACE(REPLACE(REPLACE(raw_text,' ',''),CHAR(10),''),CHAR(13),''));
   CREATE UNIQUE INDEX IF NOT EXISTS idx_texts_norm ON texts(norm_text);`,
  // v3：文章级学习统计（旧词重现率、查词密度等看板数据源）
  `ALTER TABLE texts ADD COLUMN stats_json TEXT;`,
  // v4：查词追踪（每百词查词密度指标）
  `CREATE TABLE IF NOT EXISTS lookup_log(id INTEGER PRIMARY KEY, word TEXT NOT NULL, text_id INTEGER, created_at INTEGER NOT NULL);`,
  // v5：考试模式——试卷 / 作答记录 / 错题本（概念卡复用 lexemes(pos='__concept__')+notes+cards 的 FSRS 链路）
  `CREATE TABLE IF NOT EXISTS papers(
    id INTEGER PRIMARY KEY, title TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'cet6',
    raw_md TEXT NOT NULL, norm_text TEXT UNIQUE, struct_json TEXT NOT NULL,
    n_questions INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS attempts(
    id INTEGER PRIMARY KEY, paper_id INTEGER NOT NULL REFERENCES papers(id),
    answers_json TEXT NOT NULL, result_json TEXT NOT NULL,
    started_at INTEGER NOT NULL, finished_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS wrong_questions(
    id INTEGER PRIMARY KEY, paper_id INTEGER NOT NULL, q_index INTEGER NOT NULL,
    picked TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'active', stage INTEGER NOT NULL DEFAULT 0,
    next_review INTEGER NOT NULL, redos INTEGER NOT NULL DEFAULT 0,
    concept_card_id INTEGER, created_at INTEGER NOT NULL, UNIQUE(paper_id, q_index));
   CREATE INDEX IF NOT EXISTS idx_wrong_next ON wrong_questions(state, next_review);`,
  // v6：试卷听力音频（文件名，实体文件在 data/media/，由导入时复制）
  `ALTER TABLE papers ADD COLUMN audio TEXT NOT NULL DEFAULT '';`,
  // v7：笔记来源分层 reading=阅读挖矿 / syllabus=考纲收录 / shadow=跟读问题词 / concept=错题概念（替代旧的 text_id 是否为空推断）
  // 写成可重入函数：source 列已存在（上次在加列后、版本推进前崩溃）时不重复 ALTER，回填语句本身幂等
  migrateV7,
  // v8：每日好文 RSS 源与条目（feeds.cjs，建表语句全部 IF NOT EXISTS，天然可重入）
  MIGRATION_V8,
  // v9：文章多来源表（S6 书库卡片化）。来源不进 stats_json（重新标注会整包覆盖），独立成表可多来源并存
  `CREATE TABLE IF NOT EXISTS text_sources(
    id INTEGER PRIMARY KEY,
    text_id INTEGER NOT NULL REFERENCES texts(id),
    kind TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    uri TEXT NOT NULL DEFAULT '',
    external_ref TEXT NOT NULL DEFAULT '',
    imported_at INTEGER NOT NULL,
    UNIQUE(text_id, kind, external_ref));
   CREATE INDEX IF NOT EXISTS idx_text_sources_text ON text_sources(text_id);`,
  // v10：S7b 离线机翻按段缓存（Bergamot）。source_sha256+model_revision 决定失效；段落是展示与进度单位
  `CREATE TABLE IF NOT EXISTS text_translations(
    id INTEGER PRIMARY KEY,
    text_id INTEGER NOT NULL REFERENCES texts(id),
    para_index INTEGER NOT NULL,
    source_sha256 TEXT NOT NULL,
    src_lang TEXT NOT NULL DEFAULT 'en',
    dst_lang TEXT NOT NULL DEFAULT 'zh',
    engine TEXT NOT NULL DEFAULT 'bergamot',
    model_revision TEXT NOT NULL DEFAULT '',
    translated_text TEXT NOT NULL DEFAULT '',
    pairs_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'ok',
    updated_at INTEGER NOT NULL,
    UNIQUE(text_id, para_index, src_lang, dst_lang));
   CREATE INDEX IF NOT EXISTS idx_text_translations_text ON text_translations(text_id);`,
  // v11：S9-0 数据契约——学习会话/恢复状态/漏网词相遇/覆盖率不可变快照/设置，考试前台活跃毫秒
  migrateV11,
  // v12：S11-c 跟读句 1/3/7 轻量复习（句子级调度，不进 FSRS 卡池）
  `CREATE TABLE IF NOT EXISTS shadow_sentences(
    id INTEGER PRIMARY KEY,
    sentence_hash TEXT NOT NULL UNIQUE,
    sentence TEXT NOT NULL,
    text_id INTEGER,
    source_title TEXT NOT NULL DEFAULT '',
    first_practiced_at INTEGER NOT NULL,
    last_practiced_at INTEGER NOT NULL,
    practice_count INTEGER NOT NULL DEFAULT 1 CHECK(practice_count>=1),
    stage INTEGER NOT NULL DEFAULT 0 CHECK(stage BETWEEN 0 AND 3),
    due_at INTEGER NOT NULL,
    best_similarity INTEGER NOT NULL DEFAULT 0 CHECK(best_similarity BETWEEN 0 AND 100),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','graduated','dismissed')));
   CREATE INDEX IF NOT EXISTS idx_shadow_due ON shadow_sentences(status,due_at);`,
  // v13：V8 对话——会话/轮次（状态机+播放游标），learning_sessions.kind 扩展 conversation
  migrateV13,
  migrateV14,
  migrateV15,
];

// v7 迁移体（独立函数，便于在事务内调用且可重入）
function migrateV7(db) {
  const cols = db.prepare("PRAGMA table_info(notes)").all().map((c) => c.name);
  if (!cols.includes("source")) {
    db.exec("ALTER TABLE notes ADD COLUMN source TEXT NOT NULL DEFAULT 'reading';");
  }
  db.exec(`
    UPDATE notes SET source='concept' WHERE lexeme_id IN (SELECT id FROM lexemes WHERE pos='__concept__');
    UPDATE notes SET source='syllabus' WHERE source='reading' AND text_id IS NULL AND context_sentence LIKE '（从词表收录%';`);
}

// v11 迁移体（S9-0 数据契约；全部 IF NOT EXISTS/列检测，可重入、可在中断后重跑）
function migrateV11(db) {
  db.exec(`
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
  CREATE INDEX IF NOT EXISTS idx_coverage_created ON coverage_assessments(created_at);`);
  const atCols = db.prepare("PRAGMA table_info(attempts)").all().map((c) => c.name);
  if (!atCols.includes("active_ms")) {
    db.exec("ALTER TABLE attempts ADD COLUMN active_ms INTEGER NOT NULL DEFAULT 0;");
  }
}

// v13 迁移体（V8-0；可检测、可重入；每版迁移在同一事务内）
function migrateV13(db) {
  // learning_sessions.kind 扩展 conversation：检测现有 CHECK 是否已含，未含则表重建
  const lsRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='learning_sessions'").get();
  if (!lsRow || !lsRow.sql || !lsRow.sql.includes("'conversation'")) {
    db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_sessions_ref ON learning_sessions(ref_type, ref_id);`);
  }
  db.exec(`
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
  CREATE INDEX IF NOT EXISTS idx_conv_turns_status ON conversation_turns(status);`);
}

// v14 迁移体（V9 数据契约；可检测、可重入；每版迁移在同一事务内）
function migrateV14(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS learning_assets(
    id INTEGER PRIMARY KEY,
    asset_kind TEXT NOT NULL CHECK(asset_kind IN ('word','chunk','grammar','pronunciation','concept')),
    canonical TEXT NOT NULL,
    gloss TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(payload_json)),
    lexeme_id INTEGER,
    identity_key TEXT NOT NULL,
    content_hash TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','tombstoned')),
    created_at INTEGER NOT NULL,
    confirmed_at INTEGER NOT NULL DEFAULT 0,
    idempotency_key TEXT NOT NULL,
    CHECK((asset_kind='word')=(lexeme_id IS NOT NULL)),
    UNIQUE(asset_kind, identity_key),
    UNIQUE(idempotency_key));
  CREATE INDEX IF NOT EXISTS idx_assets_kind_created ON learning_assets(asset_kind, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_word_lexeme ON learning_assets(lexeme_id)
    WHERE asset_kind='word' AND lexeme_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS asset_encounters(
    id INTEGER PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES learning_assets(id) ON DELETE CASCADE,
    origin_kind TEXT NOT NULL CHECK(origin_kind IN ('reading','conversation','shadow','exam','syllabus')),
    origin_ref TEXT NOT NULL DEFAULT '',
    locator_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(locator_json)),
    locator_hash TEXT NOT NULL DEFAULT '',
    title_snapshot TEXT NOT NULL DEFAULT '',
    sentence_snapshot TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL DEFAULT '',
    source_status TEXT NOT NULL DEFAULT 'active' CHECK(source_status IN ('active','deleted')),
    encountered_at INTEGER NOT NULL,
    UNIQUE(asset_id, origin_kind, origin_ref, locator_hash));
  CREATE INDEX IF NOT EXISTS idx_enc_origin ON asset_encounters(origin_kind, origin_ref);
  CREATE TABLE IF NOT EXISTS asset_relations(
    id INTEGER PRIMARY KEY,
    from_asset INTEGER NOT NULL REFERENCES learning_assets(id) ON DELETE CASCADE,
    to_asset INTEGER NOT NULL REFERENCES learning_assets(id) ON DELETE CASCADE,
    rel TEXT NOT NULL CHECK(rel IN ('contains','exemplifies','pronunciation_of','variant_of')),
    detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
    CHECK(from_asset<>to_asset),
    UNIQUE(from_asset, to_asset, rel));
  CREATE TABLE IF NOT EXISTS asset_evidence(
    id INTEGER PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES learning_assets(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL,
    result TEXT NOT NULL CHECK(result IN ('correct','partial','wrong','improved','recurred','used_spontaneously')),
    source_kind TEXT NOT NULL CHECK(source_kind IN ('reading','conversation','shadow','exam','syllabus','review')),
    source_ref TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(payload_json)),
    occurred_at INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE);
  CREATE INDEX IF NOT EXISTS idx_evidence_asset ON asset_evidence(asset_id, occurred_at);`);
  // cards 重建为严格 XOR：缺 asset_id 或缺资产级联时重建（可重入）
  const cardsRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='cards'").get();
  const cardsHasAsset = cardsRow && cardsRow.sql && cardsRow.sql.includes('asset_id');
  const cardsHasCascade = cardsRow && cardsRow.sql
    && cardsRow.sql.includes('REFERENCES learning_assets(id) ON DELETE CASCADE');
  if (cardsRow && (!cardsHasAsset || !cardsHasCascade)) {
    db.exec(`
    CREATE TABLE cards_v14(
      id INTEGER PRIMARY KEY,
      note_id INTEGER REFERENCES notes(id),
      asset_id INTEGER REFERENCES learning_assets(id) ON DELETE CASCADE,
      card_type TEXT NOT NULL,
      due INTEGER NOT NULL,
      state INTEGER NOT NULL DEFAULT 0,
      stability REAL, difficulty REAL,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      last_review INTEGER,
      created_at INTEGER NOT NULL,
      CHECK((note_id IS NOT NULL AND asset_id IS NULL)
            OR (note_id IS NULL AND asset_id IS NOT NULL)));`);
    if (cardsHasAsset) {
      db.exec(`INSERT INTO cards_v14
        (id,note_id,asset_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at)
        SELECT id,note_id,asset_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at
        FROM cards;`);
    } else {
      db.exec(`INSERT INTO cards_v14
        (id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at)
        SELECT id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at
        FROM cards;`);
    }
    db.exec(`
    DROP TABLE cards;
    ALTER TABLE cards_v14 RENAME TO cards;
    CREATE INDEX idx_cards_due ON cards(due, state);
    CREATE INDEX idx_cards_note ON cards(note_id);
    CREATE INDEX idx_cards_asset ON cards(asset_id);`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_asset_type
    ON cards(asset_id, card_type) WHERE asset_id IS NOT NULL;`);
}

// v15：①asset_evidence 重建 result CHECK 扩 10 值；②shadow_sentences 加来源；③debrief_drafts
function migrateV15(db) {
  // ① evidence 重建（旧 6 值全部包含在新 10 值内，直接拷贝；可重入：检测 CHECK 口径）
  const evRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='asset_evidence'").get();
  const evHasTen = evRow && evRow.sql && evRow.sql.includes('practice_observation')
    && evRow.sql.includes('used_prompted') && evRow.sql.includes('used_after_correction')
    && evRow.sql.includes('recognized');
  if (evRow && !evHasTen) {
    db.exec(`
    CREATE TABLE asset_evidence_v15(
      id INTEGER PRIMARY KEY,
      asset_id INTEGER NOT NULL REFERENCES learning_assets(id) ON DELETE CASCADE,
      dimension TEXT NOT NULL,
      result TEXT NOT NULL CHECK(result IN ('correct','partial','wrong','practice_observation',
        'improved','recurred','recognized','used_spontaneously','used_prompted','used_after_correction')),
      source_kind TEXT NOT NULL CHECK(source_kind IN ('reading','conversation','shadow','exam','syllabus','review')),
      source_ref TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(payload_json)),
      occurred_at INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE);
    INSERT INTO asset_evidence_v15
      (id,asset_id,dimension,result,source_kind,source_ref,payload_json,occurred_at,idempotency_key)
    SELECT id,asset_id,dimension,result,source_kind,source_ref,payload_json,occurred_at,idempotency_key
    FROM asset_evidence;
    DROP TABLE asset_evidence;
    ALTER TABLE asset_evidence_v15 RENAME TO asset_evidence;
    CREATE INDEX idx_evidence_asset ON asset_evidence(asset_id, occurred_at);`);
  }
  // ② shadow_sentences 来源字段（可重入：列已存在则跳过）
  const shCols = db.prepare("PRAGMA table_info(shadow_sentences)").all().map((c) => c.name);
  if (!shCols.includes('origin_kind')) {
    db.exec("ALTER TABLE shadow_sentences ADD COLUMN origin_kind TEXT NOT NULL DEFAULT 'reading';");
  }
  if (!shCols.includes('origin_ref')) {
    db.exec("ALTER TABLE shadow_sentences ADD COLUMN origin_ref TEXT NOT NULL DEFAULT '';");
  }
  // ③ 复盘草稿
  db.exec(`
  CREATE TABLE IF NOT EXISTS debrief_drafts(
    draft_key TEXT PRIMARY KEY,
    origin_kind TEXT NOT NULL CHECK(origin_kind IN ('reading','conversation','shadow','exam')),
    origin_ref TEXT NOT NULL,
    candidates_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(candidates_json)),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','skipped')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(origin_kind, origin_ref));
  CREATE INDEX IF NOT EXISTS idx_debrief_status ON debrief_drafts(status, updated_at);`);
}

// —— V9 资产身份/规范化纯函数（asset-service 用，导出供单测）——
function normalizeExpression(str) {
  return String(str || "")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ").trim().toLowerCase();
}
function shortHash(str) {
  let h = 5381;
  for (let i = 0; i < String(str).length; i++) { h = ((h << 5) + h + str.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36);
}
function assetIdentity(kind, o) {
  switch (kind) {
    case 'word': return `lex:${o.lexeme_id}`;
    case 'chunk': return `chk:${normalizeExpression(o.canonical)}`;
    case 'grammar': return `gra:${normalizeExpression(o.canonical)}|${(o.payload && o.payload.exercise_form) || ''}`;
    case 'pronunciation': return `pron:${normalizeExpression(o.canonical)}|${(o.payload && o.payload.problem_type) || ''}`;
    case 'concept': return `con:${o.paper_id}:${o.q_index}:${shortHash(o.test_point || o.canonical)}`;
    default: throw new Error('bad asset_kind');
  }
}
const ASSET_CARD_TYPES = {
  chunk: ['chunk_recall', 'chunk_cloze'],
  grammar: ['grammar_pattern'],
  pronunciation: ['pron_perception'], // 产出卡 pron_production 只能由产出链人工确认后建
  concept: ['concept_recall'],
  word: [], // word 的卡由现有 note/card 管线拥有
};

class Core {
  constructor(dataDir, opts = {}) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.dataDir = dataDir;
    const dbFile = path.join(dataDir, "user.sqlite");
    this.user = new DatabaseSync(dbFile);
    // 启动完整性检查（方案 §20）：损坏则隔离坏库并回退最近快照（须在设置 WAL 前，坏文件设置 WAL 会直接抛错）
    this.recoveryNotice = "";
    if (!this.integrityOk()) this.recoverFromSnapshot(dbFile);
    this.user.exec("PRAGMA journal_mode=WAL");
    this.migrate();
    // V9 自愈：已迁移库若 cards 资产 FK 无级联，按标准流程重建一次（幂等）
    this.repairAssetFkCascade();
    // 热路径缺索引补齐（幂等，不占迁移版本号）：
    // notes 按 lexeme_id/text_id 查是建卡与复习的常规路径；lookup_log 被 dashboard 按近 30 文逐文 COUNT、
    // 被 listTexts 作相关子查询、被日聚合按 created_at 区间扫——无索引时都是全表扫
    this.user.exec(`
      CREATE INDEX IF NOT EXISTS idx_notes_lexeme ON notes(lexeme_id);
      CREATE INDEX IF NOT EXISTS idx_notes_text ON notes(text_id);
      CREATE INDEX IF NOT EXISTS idx_lookup_text ON lookup_log(text_id);
      CREATE INDEX IF NOT EXISTS idx_lookup_time ON lookup_log(created_at);`);
    // S3 每日好文：RSS 源注册表 + 条目库（默认源幂等 seed；opts.feedFetcher 仅供测试注入）
    this.feeds = new FeedManager(this.user, { now: nowMs, fetcher: opts.feedFetcher });
    this.feeds.seed();
    const dictPath = path.join(__dirname, "data", "dict.sqlite");
    this.user.exec(`ATTACH DATABASE '${dictPath.replace(/'/g, "''")}' AS dict`);
    // 分层词库：L0=dict（ECDICT，最高优先）；L1=领域词包（内置 data/packs + 用户 dataDir/packs，只补不覆盖）
    // opts.bundledPacks/userPacks 供测试隔离词包；生产默认都启用
    this.attachPacks(dataDir, { bundled: opts.bundledPacks !== false, user: opts.userPacks !== false });
    this.buildLexicon();

    this.fsrsEngine = fsrs(generatorParameters({ request_retention: REQUEST_RETENTION }));
    this.builtins = require(path.join(__dirname, "data", "builtins.cjs"));
    // 已学词元集合（旧词重现分析的底册）
    this.learned = new Set(
      this.user.prepare("SELECT DISTINCT lemma FROM lexemes").all().map((r) => r.lemma.toLowerCase())
    );
    this.backfillCards();
    this.repairNoteSentences();
    // S6：为历史文章回填来源（feed_items.text_id / 内置素材），幂等
    this.backfillSources();
    // S6：为缺少全文 CEFR 的旧 stats 补算一次（annotateAndSave 现在会写 cefr）
    this.backfillTextCefr();
    // S9-1：存量文章一次性回填覆盖率快照与漏网词相遇（新文章走标注路径）
    this.backfillCoverageAssessments();
    this.backfillUnknownEncounters();
    this.pruneFunctionEncounters();
    this.consolidateEncounterLemmas();
    this.cleanupEncountersV2();
    this.pruneFunctionLexemes();
    // 修复旧版阅读会话 amount=全文词数导致的精读词数虚高
    this.repairReadAmounts();
    // S9-1：启动回收——上次未正常关闭的 open 会话按遗弃处理
    this.reapAbandonedSessions();
  }

  // PRAGMA integrity_check：健康时恰好返回单行 "ok"
  integrityOk() {
    try {
      const rows = this.user.prepare("PRAGMA integrity_check").all();
      return rows.length === 1 && Object.values(rows[0])[0] === "ok";
    } catch {
      return false;
    }
  }

  // 损坏恢复：隔离坏库（含 -wal/-shm）→ 用 backups/ 最新快照顶替；无快照则抛错
  recoverFromSnapshot(dbFile) {
    this.user.close();
    const stamp = ymd(new Date()).replace(/-/g, "") + "-" + String(Date.now()).slice(-6);
    for (const ext of ["", "-wal", "-shm"]) {
      const f = dbFile + ext;
      if (fs.existsSync(f)) fs.renameSync(f, path.join(this.dataDir, `user.corrupt-${stamp}${ext}.bak`));
    }
    const bakDir = path.join(this.dataDir, "backups");
    const snaps = fs.existsSync(bakDir)
      ? fs.readdirSync(bakDir).filter((f) => /^user-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().reverse()
      : [];
    if (!snaps.length) throw new Error("用户数据库损坏，且 data/backups 下无可用快照");
    fs.copyFileSync(path.join(bakDir, snaps[0]), dbFile);
    this.user = new DatabaseSync(dbFile);
    this.user.exec("PRAGMA journal_mode=WAL");
    if (!this.integrityOk()) throw new Error(`回退快照 ${snaps[0]} 后完整性检查仍失败`);
    this.recoveryNotice = `检测到数据库损坏，已自动回退到 ${snaps[0]} 快照（坏库已隔离为 .bak）`;
  }

  // 每日首启一致性快照：VACUUM INTO 生成完整快照（含已提交 WAL），滚动保留 7 份
  dailyBackup() {
    const bakDir = path.join(this.dataDir, "backups");
    fs.mkdirSync(bakDir, { recursive: true });
    const target = path.join(bakDir, `user-${ymd(new Date())}.sqlite`);
    let action = "skipped";
    if (fs.existsSync(target) && fs.statSync(target).size === 0) fs.rmSync(target); // 清理上次失败残留
    if (!fs.existsSync(target)) {
      this.user.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
      action = "created";
    }
    const all = fs.readdirSync(bakDir)
      .filter((f) => /^user-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().reverse();
    for (const old of all.slice(BACKUP_KEEP)) fs.rmSync(path.join(bakDir, old));
    return { action, file: path.basename(target), kept: all.slice(0, BACKUP_KEEP) };
  }

  backupStatus() {
    const bakDir = path.join(this.dataDir, "backups");
    const files = fs.existsSync(bakDir)
      ? fs.readdirSync(bakDir).filter((f) => /^user-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().reverse()
      : [];
    return {
      count: files.length,
      last: files[0] ? files[0].replace(/^user-|\.sqlite$/g, "") : "",
      recovery: this.recoveryNotice || "",
    };
  }

  // 旧笔记补齐卡（recall、l_recog、spelling 都是后来加的）
  backfillCards() {
    this.user.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_note_type ON cards(note_id, card_type)");
    const now = nowMs();
    const notes = this.user.prepare("SELECT id FROM notes").all();
    for (const n of notes) {
      for (const ct of ["r_recog", "cloze", "recall", "l_recog", "spelling"]) {
        this.user
          .prepare("INSERT OR IGNORE INTO cards(note_id, card_type, due, state, created_at) VALUES(?,?,?,0,?)")
          .run(n.id, ct, now, now);
      }
    }
  }

  // 修复历史坏数据：例句里不含词元的笔记，重新按词元定位例句
  repairNoteSentences() {
    const bad = this.user
      .prepare(`SELECT n.id AS nid, n.lexeme_id AS lid, n.context_sentence AS cs, t.raw_text AS raw,
        (SELECT lemma FROM lexemes WHERE id=n.lexeme_id) AS lemma
        FROM notes n JOIN texts t ON t.id=n.text_id`)
      .all();
    for (const row of bad) {
      if (!row.lemma || row.cs.toLowerCase().includes(row.lemma.toLowerCase())) continue;
      const toks = this.annotate(row.raw).filter((t) => t.label !== "punct");
      for (const tk of toks) {
        if (tokenIsLemma(this, tk.text.toLowerCase(), row.lemma.toLowerCase())) {
          this.user
            .prepare("UPDATE notes SET context_sentence=? WHERE id=?")
            .run(extractSentence(row.raw, tk.start), row.nid);
          break;
        }
      }
    }
  }

  listBuiltins() {
    return this.builtins.map(({ text, ...rest }) => ({ ...rest }));
  }

  getBuiltin(id) {
    return this.builtins.find((b) => b.id === id) || null;
  }

  // 通用设置读写（app_settings）
  getSetting(k, dflt = "") {
    const row = this.user.prepare("SELECT v FROM app_settings WHERE k=?").get(k);
    return row ? row.v : dflt;
  }

  setSetting(k, v) {
    this.user
      .prepare("INSERT INTO app_settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v")
      .run(k, String(v));
  }

  // 迁移前计数（用于后置校验表重建无漂移）
  preMigrationCounts() {
    const one = (sql) => this.user.prepare(sql).get().n;
    return {
      cards: one("SELECT COUNT(*) AS n FROM cards"),
      cardsMax: this.user.prepare("SELECT COALESCE(MAX(id),0) AS n FROM cards").get().n,
      review: one("SELECT COUNT(*) AS n FROM review_log"),
      lexemes: one("SELECT COUNT(*) AS n FROM lexemes"),
      notes: one("SELECT COUNT(*) AS n FROM notes"),
    };
  }

  // 后置校验：integrity/foreign_key + 行数无漂移
  postMigrationChecks(pre, target) {
    const integ = this.user.prepare("PRAGMA integrity_check").get();
    if (!integ || integ.integrity_check !== "ok") throw new Error(`v${target} integrity_check failed`);
    const fk = this.user.prepare("PRAGMA foreign_key_check").all();
    if (fk.length) throw new Error(`v${target} foreign_key_check violations: ${fk.length}`);
    if (pre) {
      const c = this.preMigrationCounts();
      for (const k of ["cards","cardsMax","review","lexemes","notes"]) {
        if (c[k] !== pre[k]) throw new Error(`v${target} count drift on ${k}: ${pre[k]} -> ${c[k]}`);
      }
    }
  }

  // 迁移前文件备份（checkpoint 后复制，保留最近 5 份；全新小库跳过）
  snapshotBeforeMigration(target, dbFile) {
    let sz = 0;
    try { sz = fs.statSync(dbFile).size; } catch { return ""; }
    if (sz < 16 * 1024) return "";
    try { this.user.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* ignore */ }
    const dir = path.join(this.dataDir, "backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `pre-v${target}-${nowMs()}.sqlite`);
    fs.copyFileSync(dbFile, file);
    const files = fs.readdirSync(dir)
      .filter((f) => /^pre-v\d+-\d+\.sqlite$/.test(f))
      .map((f) => ({ f, t: Number(f.match(/-(\d+)\.sqlite$/)[1]) }))
      .sort((a, b) => b.t - a.t);
    for (const old of files.slice(5)) {
      try { fs.unlinkSync(path.join(dir, old.f)); } catch { /* ignore */ }
    }
    return file;
  }

  // V9 自愈：cards.asset_id 的 FK 必须 ON DELETE CASCADE（资产删除时其卡随之删除）
  repairAssetFkCascade() {
    const row = this.user.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cards'").get();
    if (!row || !row.sql) return;
    if (!row.sql.includes('asset_id')) return;
    if (row.sql.includes('REFERENCES learning_assets(id) ON DELETE CASCADE')) return;
    this.user.exec("PRAGMA foreign_keys=OFF");
    this.user.exec("BEGIN");
    try {
      this.user.exec(`CREATE TABLE cards_fix(
        id INTEGER PRIMARY KEY,
        note_id INTEGER REFERENCES notes(id),
        asset_id INTEGER REFERENCES learning_assets(id) ON DELETE CASCADE,
        card_type TEXT NOT NULL,
        due INTEGER NOT NULL,
        state INTEGER NOT NULL DEFAULT 0,
        stability REAL, difficulty REAL,
        reps INTEGER NOT NULL DEFAULT 0,
        lapses INTEGER NOT NULL DEFAULT 0,
        last_review INTEGER,
        created_at INTEGER NOT NULL,
        CHECK((note_id IS NOT NULL AND asset_id IS NULL)
              OR (note_id IS NULL AND asset_id IS NOT NULL)));
      INSERT INTO cards_fix
        (id,note_id,asset_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at)
        SELECT id,note_id,asset_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at
        FROM cards;
      DROP TABLE cards;
      ALTER TABLE cards_fix RENAME TO cards;
      CREATE INDEX idx_cards_due ON cards(due, state);
      CREATE INDEX idx_cards_note ON cards(note_id);
      CREATE INDEX idx_cards_asset ON cards(asset_id);
      CREATE UNIQUE INDEX idx_cards_asset_type ON cards(asset_id,card_type) WHERE asset_id IS NOT NULL;`);
      this.user.exec("COMMIT");
    } catch (e) {
      try { this.user.exec("ROLLBACK"); } catch { /* ignore */ }
      throw e;
    } finally {
      this.user.exec("PRAGMA foreign_keys=ON");
    }
  }

  migrate() {
    let v = this.user.prepare("PRAGMA user_version").get().user_version;
    const dbFile = path.join(this.dataDir, "user.sqlite");
    for (let i = 0; i < MIGRATIONS.length; i++) {
      if (v < i + 1) {
        // 每版迁移与版本推进同一事务；迁移前文件备份 + 后置校验，失败 ROLLBACK 并恢复备份
        const target = i + 1;
        let backupFile = "";
        let counts = null;
        try { counts = this.preMigrationCounts(); backupFile = this.snapshotBeforeMigration(target, dbFile); }
        catch { /* 备份失败不阻塞，事务仍在 */ }
        this.user.exec("PRAGMA foreign_keys=OFF"); // 表重建标准流程：须在事务外切换
        this.user.exec("BEGIN");
        try {
          const step = MIGRATIONS[i];
          if (typeof step === "function") step(this.user);
          else this.user.exec(step);
          this.postMigrationChecks(counts, target);
          this.user.exec(`PRAGMA user_version=${target}`);
          this.user.exec("COMMIT");
          this.user.exec("PRAGMA foreign_keys=ON");
        } catch (e) {
          try { this.user.exec("ROLLBACK"); } catch { /* ignore */ }
          try { this.user.exec("PRAGMA foreign_keys=ON"); } catch { /* ignore */ }
          if (backupFile) {
            try {
              fs.copyFileSync(backupFile, dbFile);
              try { fs.unlinkSync(dbFile + "-wal"); } catch { /* ignore */ }
              try { fs.unlinkSync(dbFile + "-shm"); } catch { /* ignore */ }
            } catch { /* ignore */ }
          }
          throw e;
        }
        v = target;
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
    return `${d.getFullYear()}-${m}-${dd}`;
  }

  // —— S9-1 学习会话（learning_sessions）——
  // 开放生命周期：begin（幂等，同 session_key 重试返回同一行）→ heartbeat（20s 刷新同一行）→ close。
  // active_ms/amount 由前端累计后上报，服务端只做单调钳制（网络重发/乱序不会把值改小）。
  beginSession(o = {}) {
    const kind = String(o.kind || "");
    if (kind !== "read" && kind !== "shadow" && kind !== "conversation") throw new Error("会话 kind 只能是 read/shadow/conversation");
    const refType = String(o.refType || "");
    const refId = String(o.refId ?? "");
    const title = String(o.titleSnapshot || "").slice(0, 300);
    const locator = this._sessionLocator(o.locator);
    const contentHash = String(o.contentHash || "").slice(0, 128);
    const amount = Math.max(0, Math.floor(Number(o.amount) || 0));
    const unit = o.unit === "words" || o.unit === "sentences" || o.unit === "turns" ? o.unit : "";
    const key = String(o.sessionKey || `${kind}:${refType}:${refId || "none"}:${nowMs()}`);
    const existing = this.user.prepare("SELECT * FROM learning_sessions WHERE session_key=?").get(key);
    if (existing) return this._sessionDto(existing);
    const t = nowMs();
    this.user.prepare(`INSERT INTO learning_sessions
      (kind,session_key,ref_type,ref_id,title_snapshot,locator_json,content_hash,amount,unit,started_at,ended_at,last_active_at,status,active_ms)
      VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,'open',0)`)
      .run(kind, key, refType, refId, title, locator, contentHash, amount, unit, t, t);
    return this._sessionDto(this.user.prepare("SELECT * FROM learning_sessions WHERE session_key=?").get(key));
  }

  heartbeatSession(key, o = {}) {
    const row = this.user.prepare("SELECT * FROM learning_sessions WHERE session_key=?").get(String(key));
    if (!row) throw new Error("会话不存在或已清理");
    if (row.status !== "open") return this._sessionDto(row);
    const activeMs = Math.max(row.active_ms, Math.max(0, Math.floor(Number(o.activeMs) || 0)));
    const amount = Math.max(row.amount, Math.max(0, Math.floor(Number(o.amount) || 0)));
    const t = nowMs();
    this.user.prepare("UPDATE learning_sessions SET active_ms=?, amount=?, last_active_at=?, locator_json=? WHERE id=?")
      .run(activeMs, amount, t, o.locator ? this._sessionLocator(o.locator) : row.locator_json, row.id);
    return this._sessionDto(this.user.prepare("SELECT * FROM learning_sessions WHERE id=?").get(row.id));
  }

  closeSession(key, o = {}) {
    const row = this.user.prepare("SELECT * FROM learning_sessions WHERE session_key=?").get(String(key));
    if (!row) return null;
    if (row.status === "open") {
      const activeMs = Math.max(row.active_ms, Math.max(0, Math.floor(Number(o.activeMs) || 0)));
      const amount = Math.max(row.amount, Math.max(0, Math.floor(Number(o.amount) || 0)));
      const t = nowMs();
      this.user.prepare("UPDATE learning_sessions SET status='closed', ended_at=?, active_ms=?, amount=?, last_active_at=?, locator_json=? WHERE id=?")
        .run(t, activeMs, amount, t, o.locator ? this._sessionLocator(o.locator) : row.locator_json, row.id);
    }
    return this._sessionDto(this.user.prepare("SELECT * FROM learning_sessions WHERE id=?").get(row.id));
  }

  // —— V8-2b 对话会话与轮次（七态状态机；turn_key 幂等）——
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
      goal: String(o.goal || "").trim().slice(0, 500),
      cefr: String(o.cefr || "B2"),
      suggestedTurns: Math.max(2, Math.min(40, Number(o.suggestedTurns) || 8)),
    };
    if (!topic.goal) throw new Error("请填写话题目标");
    const key = String(o.sessionKey || `conv:${crypto.randomUUID()}`);
    const existing = this.user.prepare("SELECT * FROM conversation_sessions WHERE session_key=?").get(key);
    if (existing) return this._convSessionDto(existing);
    const t = nowMs();
    this.user.prepare(`INSERT INTO conversation_sessions
      (session_key,title,topic_json,started_at,last_active_at,status,active_ms,brain_engine,brain_model_revision,augmented,cefr_at_start,turns_count)
      VALUES (?,?,?,?,?,'open',0,?,?,0,?,0)`)
      .run(key, topic.goal.slice(0, 200), JSON.stringify(topic), t, t,
        String(o.brainEngine || "local"), String(o.brainModelRevision || ""), topic.cefr);
    return this._convSessionDto(this.user.prepare("SELECT * FROM conversation_sessions WHERE session_key=?").get(key));
  }

  convList(limit = 20) {
    return this.user.prepare("SELECT * FROM conversation_sessions ORDER BY started_at DESC, id DESC LIMIT ?")
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
    const key = String(o.turnKey || `turn:${crypto.randomUUID()}`);
    const existing = this.user.prepare("SELECT * FROM conversation_turns WHERE turn_key=?").get(key);
    if (existing) return this._convTurnDto(existing);
    const sess = this.user.prepare("SELECT * FROM conversation_sessions WHERE session_key=?").get(String(o.sessionKey));
    if (!sess) throw new Error("对话会话不存在");
    const role = o.role === "assistant" ? "assistant" : "user";
    const status = String(o.status || (role === "user" ? "user_confirmed" : "generating"));
    const seq = Number.isInteger(Number(o.seq)) ? Number(o.seq)
      : this.user.prepare("SELECT COALESCE(MAX(seq),-1)+1 AS n FROM conversation_turns WHERE session_id=?").get(sess.id).n;
    const t = nowMs();
    this.user.prepare(`INSERT INTO conversation_turns
      (turn_key,session_id,seq,role,status,text,committed_text,provider,model_revision,asr_engine,asr_model,edited,audio_ref,local_feedback_json,cloud_feedback_json,augment_status,interrupted_at,error_code,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,'','[]','[]','pending',NULL,'',?)`)
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
      if (o[k] !== undefined) { sets.push(`${col}=?`); vals.push(fn(o[k])); }
    }
    if (sets.length) {
      vals.push(row.id);
      this.user.prepare(`UPDATE conversation_turns SET ${sets.join(",")} WHERE id=?`).run(...vals);
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

  // 崩溃/重启恢复：generating → failed；speaking → interrupted（保留已播前缀作为权威历史）
  convRecover(now = nowMs()) {
    let n = 0;
    const rows = this.user.prepare(
      "SELECT id,status FROM conversation_turns WHERE status IN ('generating','speaking')",
    ).all();
    for (const r of rows) {
      if (r.status === "generating") {
        this.user.prepare(
          "UPDATE conversation_turns SET status='failed', error_code='interrupted_by_restart' WHERE id=?",
        ).run(r.id);
      } else {
        this.user.prepare(
          "UPDATE conversation_turns SET status='interrupted', interrupted_at=? WHERE id=?",
        ).run(now, r.id);
      }
      n++;
    }
    return { recovered: n };
  }

  // 启动回收：open 且 last_active 早于 10 分钟前 → abandoned，ended_at 补 last_active+一个刷新周期(20s)
  reapAbandonedSessions(now = nowMs()) {
    const cutoff = now - 10 * 60 * 1000;
    const r = this.user.prepare(
      `UPDATE learning_sessions SET status='abandoned', ended_at=MIN(last_active_at+20000, ?)
       WHERE status='open' AND last_active_at < ?`).run(now, cutoff);
    return r.changes || 0;
  }

  // 修复阅读会话词数：旧版每次打开都把全文总词数当 amount，短时间多次打开会虚高。
  // 按活跃时间与极速扫读上限（300 wpm，正常精读远低于此）封顶；一次性维护，幂等。
  repairReadAmounts() {
    if (this.user.prepare("SELECT 1 FROM app_settings WHERE k='read_amount_repaired_v1'").get()) return 0;
    const WPM_CAP = 300;
    const rows = this.user.prepare(
      "SELECT id, amount, active_ms FROM learning_sessions WHERE kind='read' AND unit='words' AND amount>0").all();
    const upd = this.user.prepare("UPDATE learning_sessions SET amount=? WHERE id=?");
    let fixed = 0;
    this.user.exec("BEGIN");
    try {
      for (const r of rows) {
        const cap = Math.round(((r.active_ms || 0) / 60000) * WPM_CAP);
        if (r.amount > cap) { upd.run(cap, r.id); fixed++; }
      }
      this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('read_amount_repaired_v1','1')").run();
      this.user.exec("COMMIT");
    } catch (e) {
      try { this.user.exec("ROLLBACK"); } catch { /* ignore */ }
      throw e;
    }
    return fixed;
  }

  _sessionLocator(loc) {
    let json = "{}";
    if (loc && typeof loc === "object") json = JSON.stringify(loc);
    else if (typeof loc === "string") json = loc;
    try { JSON.parse(json); } catch { throw new Error("locator 不是合法 JSON"); }
    return json;
  }

  _sessionDto(r) {
    return {
      id: r.id, kind: r.kind, sessionKey: r.session_key, refType: r.ref_type, refId: r.ref_id,
      titleSnapshot: r.title_snapshot, locator: JSON.parse(r.locator_json || "{}"),
      contentHash: r.content_hash, amount: r.amount, unit: r.unit,
      startedAt: r.started_at, endedAt: r.ended_at, lastActiveAt: r.last_active_at,
      status: r.status, activeMs: r.active_ms,
    };
  }

  // S9-2：断点续学。scope='reading'|'shadow'，每 scope 仅保留最新一行
  saveResumeState(scope, refId, locator, contentHash = "") {
    if (scope !== "reading" && scope !== "shadow") throw new Error("非法 resume scope");
    const json = this._sessionLocator(locator);
    const t = nowMs();
    this.user.prepare(
      `INSERT INTO resume_state(scope, ref_id, locator_json, content_hash, updated_at)
        VALUES(?,?,?,?,?)
        ON CONFLICT(scope) DO UPDATE SET ref_id=excluded.ref_id, locator_json=excluded.locator_json,
          content_hash=excluded.content_hash, updated_at=excluded.updated_at`)
      .run(scope, String(refId ?? ""), json, String(contentHash || ""), t);
    return this.getResumeState(scope);
  }

  getResumeState(scope) {
    if (scope !== "reading" && scope !== "shadow") throw new Error("非法 resume scope");
    const r = this.user.prepare("SELECT * FROM resume_state WHERE scope=?").get(scope);
    if (!r) return null;
    return {
      scope: r.scope, refId: r.ref_id, locator: JSON.parse(r.locator_json || "{}"),
      contentHash: r.content_hash, updatedAt: r.updated_at,
    };
  }

  // —— S11-c：跟读句 1/3/7 轻量复习（只提醒重练，不生成 FSRS 卡）——
  // stage: 0=练完待 1 天，1=待 3 天，2=待 7 天，3=已出师；到期当天再次完成比对才推进
  static SHADOW_STEPS_DAYS = [1, 3, 7];
  static normalizeShadowSentence(s0) {
    return String(s0 ?? "").trim().replace(/\s+/g, " ");
  }

  shadowPractice({
    sentence, textId = null, title = "", similarity = 0,
    originKind = "reading", originRef = "",
  } = {}) {
    const sent = Core.normalizeShadowSentence(sentence);
    if (!sent) throw new Error("缺少跟读语境句");
    if (!["reading", "conversation"].includes(originKind))
      throw new Error("originKind 非法");
    const hash = crypto.createHash("sha256").update(sent.toLowerCase()).digest("hex");
    const now = nowMs();
    const sim = Math.max(0, Math.min(100, Math.round(Number(similarity) || 0)));
    const tid = textId == null ? null : Number(textId);
    let ttl = String(title || "");
    if (!ttl && tid != null) {
      const tr = this.user.prepare("SELECT title FROM texts WHERE id=?").get(tid);
      if (tr) ttl = String(tr.title || "");
    }
    const existing = this.user.prepare("SELECT * FROM shadow_sentences WHERE sentence_hash=?").get(hash);
    let stage, status, dueAt, advanced = false, graduated = false, isNew = false;
    if (!existing) {
      stage = 0; status = "active"; dueAt = now + DAY_MS; isNew = true;
      this.user.prepare(
        `INSERT INTO shadow_sentences
         (sentence_hash,sentence,text_id,source_title,first_practiced_at,last_practiced_at,
          practice_count,stage,due_at,best_similarity,status,origin_kind,origin_ref)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(hash, sent, tid, ttl, now, now, 1, stage, dueAt, sim, status,
          originKind, String(originRef || ""));
    } else {
      stage = existing.stage; status = existing.status; dueAt = existing.due_at;
      if (status === "active" && now >= existing.due_at) {
        stage = existing.stage + 1; advanced = true;
        if (stage >= 3) { status = "graduated"; dueAt = 0; graduated = true; }
        else dueAt = now + Core.SHADOW_STEPS_DAYS[stage] * DAY_MS;
      }
      this.user.prepare(
        `UPDATE shadow_sentences SET last_practiced_at=?, practice_count=practice_count+1, stage=?, due_at=?,
           best_similarity=MAX(best_similarity,?), status=?,
           text_id=COALESCE(text_id,?),
           origin_kind=CASE WHEN origin_kind='reading' AND ?='conversation' THEN 'conversation' ELSE origin_kind END,
           origin_ref=CASE WHEN origin_ref='' AND ?<>'' THEN ? ELSE origin_ref END,
           source_title=CASE WHEN source_title='' THEN ? ELSE source_title END
         WHERE id=?`)
        .run(now, stage, dueAt, sim, status, tid,
          originKind, String(originRef || ""), String(originRef || ""),
          ttl, existing.id);
    }
    return { hash, isNew, advanced, graduated, stage, status, dueAt, sentence: sent };
  }

  shadowDue(limit = 20) {
    const now = nowMs();
    const n = Math.max(1, Math.min(200, Number(limit) || 20));
    return this.user.prepare(
      `SELECT id, sentence, text_id AS textId, source_title AS sourceTitle, stage,
              due_at AS dueAt, practice_count AS practiceCount, best_similarity AS bestSimilarity,
              ?-due_at AS overdueMs
         FROM shadow_sentences WHERE status='active' AND due_at<=?
         ORDER BY due_at ASC LIMIT ?`).all(now, now, n);
  }

  shadowDueCount() {
    return this.user.prepare(
      "SELECT COUNT(*) n FROM shadow_sentences WHERE status='active' AND due_at<=?").get(nowMs()).n;
  }

  shadowDismiss(id) {
    const r = this.user.prepare(
      "UPDATE shadow_sentences SET status='dismissed' WHERE id=? AND status='active'").run(Number(id));
    return r.changes > 0;
  }

  // S13-d-1 来源句跟读通过标记
  shadowPassedForSentences({ sentences = [] } = {}) {
    const out = [];
    for (const s0 of sentences) {
      const sent = Core.normalizeShadowSentence(s0);
      if (!sent) { out.push(false); continue; }
      const hash = crypto.createHash("sha256").update(sent.toLowerCase()).digest("hex");
      const row = this.user.prepare(
        "SELECT status FROM shadow_sentences WHERE sentence_hash=?").get(hash);
      out.push(Boolean(row) && row.status === "graduated");
    }
    return out;
  }

  shadowPassedForTurn(turnId) {
    const row = this.user.prepare(
      "SELECT status FROM shadow_sentences WHERE origin_kind='conversation' AND origin_ref=? AND status='graduated'")
      .get(String(turnId));
    return Boolean(row);
  }

  // ============ S12 平行文本能力测评（冻结蓝图，不冻结文章）============  // ============ S12 平行文本能力测评（冻结蓝图，不冻结文章）============
  _assessmentBank() {
    if (!this._ab) this._ab = require(path.join(__dirname, "data", "assessment-bank.json"));
    return this._ab;
  }
  _usedAssessments() {
    const row = this.user.prepare("SELECT v FROM app_settings WHERE k='parallel_used_forms'").get();
    let arr = [];
    try { arr = row ? JSON.parse(row.v) : []; } catch { arr = []; }
    return new Set(Array.isArray(arr) ? arr : []);
  }
  _markAssessmentUsed(formId) {
    const set = this._usedAssessments();
    set.add(formId);
    this.user.prepare("INSERT INTO app_settings(k,v) VALUES('parallel_used_forms',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(JSON.stringify([...set]));
  }
  // 测评蓝图列表（含剩余平行卷数）
  assessmentBlueprints() {
    const bank = this._assessmentBank();
    const used = this._usedAssessments();
    return bank.blueprints.map((bp) => {
      const forms = bank.forms.filter((f) => f.blueprint === bp.id);
      return { ...bp, forms_total: forms.length, forms_left: forms.filter((f) => !used.has(f.id)).length };
    });
  }
  // 取一篇未用过的同级平行卷，返回题目与开卷覆盖率（fresh annotate）
  assessmentStart(blueprintId) {
    const bank = this._assessmentBank();
    const bp = bank.blueprints.find((x) => x.id === blueprintId);
    if (!bp) throw new Error("未知测评等级");
    const used = this._usedAssessments();
    const pool = bank.forms.filter((f) => f.blueprint === bp.id && !used.has(f.id));
    if (!pool.length) throw new Error("该等级的测评卷已用完（每篇只用一次，防止练习效应）");
    const form = pool[Math.floor(Math.random() * pool.length)];
    const builtin = this.builtins.find((b) => b.id === form.builtin_id);
    if (!builtin) throw new Error("测评原文缺失");
    const cov = this._assessmentCoverage(builtin.text);
    return {
      form_id: form.id, builtin_id: form.builtin_id, blueprint: bp.id, cefr: bp.cefr,
      title: builtin.title,
      questions: form.questions.map(({ q, options }) => ({ q, options })),
      coverage: cov,
    };
  }
  _assessmentCoverage(text) {
    const ann = this.annotate(text).filter((t) => t.label !== "punct");
    const total = ann.length;
    const known = ann.filter((t) => t.label !== "miss").length;
    return { rate: total ? known / total : 0, total, known };
  }
  // 交卷：合成"陌生同级材料独立理解得分"，写 coverage_assessments(kind=parallel_test) 并标记该卷已用
  assessmentFinish(input) {
    const { form_id, active_ms, lookups, translated_paras, answers } = input || {};
    const bank = this._assessmentBank();
    const form = bank.forms.find((f) => f.id === form_id);
    if (!form) throw new Error("未知测评卷");
    if (this._usedAssessments().has(form.id)) throw new Error("该测评卷已提交，不能重复计分");
    const bp = bank.blueprints.find((x) => x.id === form.blueprint);
    if (!bp) throw new Error("测评蓝图缺失");
    const builtin = this.builtins.find((b) => b.id === form.builtin_id);
    if (!builtin) throw new Error("测评原文缺失");
    const cov = this._assessmentCoverage(builtin.text);
    const ms = Math.max(0, Math.floor(active_ms || 0));
    const wpm = ms > 0 ? Math.round(cov.total / (ms / 60000)) : 0;
    const nLook = Math.max(0, Math.floor(lookups || 0));
    const nTrans = Math.max(0, Math.floor(translated_paras || 0));
    const ans = Array.isArray(answers) ? answers : [];
    const questions = Array.isArray(form.questions) ? form.questions : [];
    let correct = 0;
    questions.forEach((q, i) => { if (ans[i] === q.answer) correct++; });
    // 题数为 0 时不能除：NaN 会让 rate 的 CHECK(rate BETWEEN 0 AND 1) 直接拒绝写入，交卷永久失败
    const compScore = questions.length ? (correct / questions.length) * 100 : 0;
    const coverageScore = cov.rate * 100;
    // 速度分：20 wpm≈10 分，95 wpm 封顶 100
    const speedScore = Math.max(0, Math.min(100, 10 + (wpm - 20) * 1.2));
    // 中文依赖分：100 起步，查词一次 -6，整段机翻一次 -10
    const depScore = Math.max(0, 100 - nLook * 6 - nTrans * 10);
    const score = Math.round(compScore * 0.45 + coverageScore * 0.25 + speedScore * 0.15 + depScore * 0.15);
    const snap = {
      blueprint: bp.id, form: form.id, correct, questions: questions.length,
      wpm, active_ms: ms, lookups: nLook, translated_paras: nTrans,
      comp: Math.round(compScore), coverage: Math.round(coverageScore),
      speed: Math.round(speedScore), dependence: Math.round(depScore),
      formula: "0.45 comp + 0.25 coverage + 0.15 speed + 0.15 dependence",
      bankVersion: bank.version,
    };
    this.user.prepare("INSERT INTO coverage_assessments (text_id,kind,cefr,total_tokens,known_tokens,rate,snapshot_json,created_at) VALUES(NULL,'parallel_test',?,?,?,?,?,?)").run(
      bp.cefr, cov.total, cov.known, score / 100, JSON.stringify(snap), nowMs());
    this._markAssessmentUsed(form.id);
    return { score, ...snap };
  }
  assessmentHistory(limit = 20) {
    return this.user.prepare("SELECT cefr, rate, snapshot_json, created_at FROM coverage_assessments WHERE kind='parallel_test' ORDER BY created_at DESC LIMIT ?")
      .all(limit).map((r) => {
        let s = {}; try { s = JSON.parse(r.snapshot_json); } catch {}
        return { cefr: r.cefr, score: Math.round(r.rate * 100), created_at: r.created_at, ...s };
      });
  }

  // S9-1：标注阶段记录"可成卡但尚无资产"的漏网词相遇事实（每篇每 lemma 一行，按当前词频覆盖，不累加）
  // 功能词判定：助动词小词表 + 词典首义项为封闭词性（art/prep/conj/pron/det/num/int/modal/part）
  isFunctionLemma(lem0) {
    const lem = String(lem0 || "").toLowerCase();
    if (!lem) return false;
    if (FUNCTION_WORDS.has(lem)) return true;
    if (this._funcYes && this._funcYes.has(lem)) return true;
    if (this._funcNo && this._funcNo.has(lem)) return false;
    const r = this.user.prepare("SELECT translation FROM dict.words WHERE word=?").get(lem);
    const first = r ? (r.translation || "").split("\\n")[0] : "";
    const isFunc = FUNCTION_POS_RE.test(first);
    if (isFunc) { (this._funcYes ||= new Set()).add(lem); } else { (this._funcNo ||= new Set()).add(lem); }
    return isFunc;
  }

  // 一次性清理：存量功能词词元及其笔记/卡片/复习记录（功能词永不进 SRS）
  pruneFunctionLexemes() {
    if (this.user.prepare("SELECT 1 FROM app_settings WHERE k='func_lexemes_pruned'").get()) return;
    const lemmas = this.user.prepare("SELECT id, lemma FROM lexemes WHERE pos<>'__concept__'").all()
      .filter((r) => this.isFunctionLemma(r.lemma));
    if (!lemmas.length) {
      this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('func_lexemes_pruned','0')").run();
      return;
    }
    const ids = lemmas.map((r) => r.id);
    const ph = ids.map(() => "?").join(",");
    this.user.exec("BEGIN");
    try {
      this.user.prepare(
        `DELETE FROM review_log WHERE card_id IN (SELECT c.id FROM cards c JOIN notes n ON n.id=c.note_id WHERE n.lexeme_id IN (${ph}))`
      ).run(...ids);
      this.user.prepare(
        `DELETE FROM cards WHERE note_id IN (SELECT id FROM notes WHERE lexeme_id IN (${ph}))`
      ).run(...ids);
      this.user.prepare(`DELETE FROM evidence_log WHERE lexeme_id IN (${ph})`).run(...ids);
      this.user.prepare(`DELETE FROM notes WHERE lexeme_id IN (${ph})`).run(...ids);
      this.user.prepare(`DELETE FROM lexemes WHERE id IN (${ph})`).run(...ids);
      for (const r of lemmas) this.learned.delete(r.lemma.toLowerCase());
      this.user.exec("COMMIT");
      this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('func_lexemes_pruned',?)")
        .run(String(lemmas.length));
      this._prunedFunctionLexemes = lemmas.map((r) => r.lemma);
    } catch (e) {
      this.user.exec("ROLLBACK");
      throw e;
    }
  }

  // 一次性清理：旧版 unknown_encounters 里的功能词行（app_settings 记录幂等）
  pruneFunctionEncounters() {
    if (this.user.prepare("SELECT 1 FROM app_settings WHERE k='func_encounters_pruned'").get()) return;
    let removed = 0;
    const lemmas = this.user.prepare("SELECT DISTINCT lemma FROM unknown_encounters").all();
    for (const { lemma } of lemmas) {
      if (lemma.length < 3 || this.isFunctionLemma(lemma)) {
        this.user.prepare("DELETE FROM unknown_encounters WHERE lemma=?").run(lemma);
        removed++;
      }
    }
    this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('func_encounters_pruned',?)").run(String(removed));
  }

  // 一次性合并：旧版按表层形记录的复数/屈折相遇归并到原形（同文计数相加）
  consolidateEncounterLemmas() {
    if (this.user.prepare("SELECT 1 FROM app_settings WHERE k='encounters_consolidated_v1'").get()) return;
    const rows = this.user.prepare("SELECT lemma,text_id,count,first_seen_at,last_seen_at FROM unknown_encounters").all();
    const merged = new Map();
    for (const r of rows) {
      const lem = this.canonical(r.lemma) || r.lemma;
      if (lem.length < 3 || this.isFunctionLemma(lem)) continue;
      const key = lem + "|" + r.text_id;
      const cur = merged.get(key);
      if (!cur) merged.set(key, { lemma: lem, text_id: r.text_id, count: r.count, f: r.first_seen_at, l: r.last_seen_at });
      else { cur.count += r.count; cur.f = Math.min(cur.f, r.first_seen_at); cur.l = Math.max(cur.l, r.last_seen_at); }
    }
    const up = this.user.prepare(`INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(lemma,text_id) DO UPDATE SET count=excluded.count,
        first_seen_at=MIN(first_seen_at,excluded.first_seen_at), last_seen_at=MAX(last_seen_at,excluded.last_seen_at)`);
    let changed = 0;
    for (const m of merged.values()) {
      const before = this.user.prepare("SELECT COUNT(*) n FROM unknown_encounters WHERE lemma=? AND text_id=?",
      ).get(m.lemma, m.text_id).n;
      up.run(m.lemma, m.text_id, m.count, m.f, m.l);
      if (!before) changed++;
    }
    // 删除仍以屈折形为键的旧行（其原形不同）
    for (const r of rows) {
      const lem = this.canonical(r.lemma) || r.lemma;
      if (lem !== r.lemma || lem.length < 3 || this.isFunctionLemma(lem)) {
        this.user.prepare("DELETE FROM unknown_encounters WHERE lemma=? AND text_id=?").run(r.lemma, r.text_id);
      }
    }
    this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('encounters_consolidated_v1',?)").run(String(changed));
  }

  // v2 一次性：v1 合并后助动词（has/had→have）与单字母复活的二次清理
  cleanupEncountersV2() {
    if (this.user.prepare("SELECT 1 FROM app_settings WHERE k='encounters_cleanup_v2'").get()) return;
    let removed = 0;
    const lemmas = this.user.prepare("SELECT DISTINCT lemma FROM unknown_encounters").all();
    for (const { lemma } of lemmas) {
      if (lemma.length < 3 || this.isFunctionLemma(lemma)) {
        this.user.prepare("DELETE FROM unknown_encounters WHERE lemma=?").run(lemma);
        removed++;
      }
    }
    this.user.prepare("INSERT OR IGNORE INTO app_settings(k,v) VALUES('encounters_cleanup_v2',?)").run(String(removed));
  }

  recordUnknownEncounters(textId, tokens) {
    const CARDABLE = new Set(["word", "cap_word", "word_lemma", "contraction", "compound"]);
    const freq = new Map();
    for (const t of tokens) {
      if (t.label === "punct" || !CARDABLE.has(t.label)) continue;
      const low = normApos(String(t.text).toLowerCase());
      const lem = this.canonical(low) || low;
      if (this.learned.has(low) || this.learned.has(lem)) continue;
      if (lem.length < 3) continue; // 单字母（PDF 数学变量 k/x 等）不进漏网词
      if (this.isFunctionLemma(lem)) continue; // 功能词/助动词不进漏网词回收
      freq.set(lem, (freq.get(lem) || 0) + 1);
    }
    const t = nowMs();
    const up = this.user.prepare(`INSERT INTO unknown_encounters(lemma,text_id,count,first_seen_at,last_seen_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(lemma,text_id) DO UPDATE SET count=excluded.count, last_seen_at=excluded.last_seen_at`);
    for (const [lem, count] of freq) up.run(lem, textId, count, t, t);
  }

  // S9-1：每篇文章首次标注写一条不可变覆盖率快照（重新标注不覆盖、不追加）
  recordFirstCoverage(textId, stats) {
    const exists = this.user.prepare("SELECT 1 FROM coverage_assessments WHERE text_id=? AND kind='first_annotate'").get(textId);
    if (exists) return false;
    const total = Math.max(0, Math.floor(stats.words || 0));
    const known = Math.min(total, Math.max(0, Math.floor(stats.learnedTokens || 0)));
    const rate = total ? known / total : 0;
    this.user.prepare(`INSERT INTO coverage_assessments
      (text_id,kind,cefr,total_tokens,known_tokens,rate,snapshot_json,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(
        textId, "first_annotate", stats.cefr || "", total, known, rate,
        JSON.stringify({
          words: stats.words, learnedTokens: stats.learnedTokens, learnedUnique: stats.learnedUnique,
          lexicalWords: stats.lexicalWords, awlRate: stats.awlRate, statsVersion: "v11",
        }), nowMs());
    return true;
  }

  // S9-1：存量文章从 stats_json 补一条覆盖率快照（诚实标记 backfilled，新文章不补、以首标为准）
  backfillCoverageAssessments() {
    const rows = this.user.prepare("SELECT id, stats_json FROM texts").all();
    const ins = this.user.prepare(`INSERT INTO coverage_assessments
      (text_id,kind,cefr,total_tokens,known_tokens,rate,snapshot_json,created_at)
      VALUES(?,?,?,?,?,?,?,?)`);
    let cnt = 0;
    for (const r of rows) {
      if (this.user.prepare("SELECT 1 FROM coverage_assessments WHERE text_id=? AND kind='first_annotate'").get(r.id)) continue;
      let st = null; try { st = JSON.parse(r.stats_json || "{}"); } catch { continue; }
      const total = Math.max(0, Math.floor(st.words || 0));
      if (!total) continue;
      const known = Math.min(total, Math.max(0, Math.floor(st.learnedTokens || 0)));
      ins.run(r.id, "first_annotate", st.cefr || "", total, known, known / total,
        JSON.stringify({ words: st.words, learnedTokens: st.learnedTokens, lexicalWords: st.lexicalWords,
          awlRate: st.awlRate, statsVersion: "v11", backfilled: true, backfilledAt: nowMs() }), nowMs());
      cnt++;
    }
    return cnt;
  }

  // S9-1：存量文章重新跑一遍标注（不落库、不改 stats），一次性补漏网词相遇事实
  backfillUnknownEncounters() {
    const rows = this.user.prepare("SELECT id, raw_text FROM texts").all();
    let cnt = 0;
    for (const r of rows) {
      const has = this.user.prepare("SELECT 1 FROM unknown_encounters WHERE text_id=? LIMIT 1").get(r.id);
      if (has) continue;
      const tokens = this.annotate(r.raw_text);
      this.recordUnknownEncounters(r.id, tokens);
      cnt++;
    }
    return cnt;
  }


  // —— S11-b 漏网词回收 ——
  // 跨篇聚合 unknown_encounters 中"仍无词元资产"的词（成卡后历史相遇保留，但候选自动消失）
  _recycleAggregate() {
    const rows = this.user.prepare(
      `SELECT u.lemma, SUM(u.count) AS total, COUNT(DISTINCT u.text_id) AS texts,
              MIN(u.first_seen_at) AS first_seen, MAX(u.last_seen_at) AS last_seen
       FROM unknown_encounters u
       WHERE NOT EXISTS (SELECT 1 FROM lexemes l WHERE l.lemma=u.lemma AND l.pos<>'__concept__')
       GROUP BY u.lemma`
    ).all();
    const srcStmt = this.user.prepare(
      `SELECT u.text_id AS text_id, t.title AS title, u.count AS count
       FROM unknown_encounters u JOIN texts t ON t.id=u.text_id
       WHERE u.lemma=? ORDER BY u.count DESC, u.last_seen_at DESC LIMIT 3`
    );
    const out = [];
    for (const row of rows) {
      if (this.isFunctionLemma(row.lemma)) continue; // 双保险：功能词永不进回收
      const alias = this.words.get(row.lemma);
      const d = alias ? this.lookupWordRow(alias, row.lemma) : null;
      if (!d) continue; // 写入口保证 cardable，查不到只可能是词包被卸载
      const tags = String(d.tag || "").split(/\s+/).filter(Boolean);
      let levelRank = 0;
      let level = "";
      for (let i = 0; i < LEVEL_LADDER.length; i++) {
        if (tags.includes(LEVEL_LADDER[i])) { levelRank = i + 1; level = LEVEL_LADDER[i]; }
      }
      const gloss = (d.translation || "").split("\\n")[0].trim();
      out.push({
        lemma: row.lemma, phonetic: d.phonetic || "", gloss,
        tag: d.tag || "", frq: Number(d.frq) || 0, level, levelRank,
        awl: AWL_BY_FORM.has(row.lemma) ? 1 : 0,
        texts: row.texts, total: row.total,
        firstSeen: row.first_seen, lastSeen: row.last_seen,
        sources: srcStmt.all(row.lemma),
      });
    }
    // 排序：考纲等级（gre>…>zk）→ AWL → 常用度（frq 排名小在前，零频垫底）→ 相遇篇数/次数
    out.sort((a, b) =>
      (b.levelRank - a.levelRank) ||
      (b.awl - a.awl) ||
      ((a.frq === 0 ? 1 : 0) - (b.frq === 0 ? 1 : 0)) ||
      (a.frq && b.frq ? a.frq - b.frq : 0) ||
      (b.texts - a.texts) ||
      (b.total - a.total));
    return out;
  }

  // opts: { minTexts=2, limit=50, offset=0 }
  recycleCandidates(opts = {}) {
    const minTexts = Math.max(1, Number(opts.minTexts) || 2);
    const limit = Math.max(1, Math.min(300, Number(opts.limit) || 50));
    const offset = pageOffset(opts.offset);
    const all = this._recycleAggregate().filter((x) => x.texts >= minTexts);
    return { total: all.length, items: all.slice(offset, offset + limit) };
  }

  recycleCount() {
    const all = this._recycleAggregate();
    return { total: all.length, multi: all.filter((x) => x.texts >= 2).length };
  }

  // 批量加入复习（走考纲收录同一条 createStandaloneNote：recall+l_recog+spelling 三卡；
  // sense 取词典首行译义，避免 recall 卡退化成"词=词"）
  recycleAdd(words) {
    if (!Array.isArray(words)) throw new Error("recycleAdd 需要词数组");
    const added = [], already = [], skipped = [];
    for (const w0 of words) {
      const lemma = String(w0 || "").toLowerCase().trim();
      if (!lemma) continue;
      if (this.isFunctionLemma(lemma)) { skipped.push({ lemma, reason: "function" }); continue; }
      const r = this.resolve(lemma, "word", false);
      if (!r) { skipped.push({ lemma, reason: "unresolved" }); continue; }
      const sense = (r.translation || "").split("\\n")[0].trim();
      const out = this.createStandaloneNote({ word: r.lemma, label: "word", phrase: false, sense });
      if (out.already) already.push(r.lemma);
      else added.push({ lemma: r.lemma, cards: out.cards_created });
    }
    return { added, already, skipped };
  }

  // 挂载领域词包：内置 data/packs/*.sqlite 优先，其次用户 dataDir/packs；同名文件只挂一次
  // 词包 schema：words(word,phonetic,pos,translation,definition,tag,bnc,frq)、mwe(phrase,translation,pos,tag)、
  //             lemma(flexion,lemma)、meta(key,value)（id/name/license/source/version）
  attachPacks(dataDir, { bundled = true, user = true } = {}) {
    this.packs = []; // {alias,id,name,file}
    const dirs = [
      ...(bundled ? [path.join(__dirname, "data", "packs")] : []),
      ...(user ? [path.join(dataDir, "packs")] : []),
    ];
    const seen = new Set();
    let n = 0;
    for (const dir of dirs) {
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".sqlite")).sort(); } catch { continue; }
      for (const f of files) {
        if (seen.has(f.toLowerCase())) continue;
        seen.add(f.toLowerCase());
        const full = path.join(dir, f);
        let probe = null;
        try {
          probe = new DatabaseSync(full, { readOnly: true });
          const tabs = probe.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
          if (!tabs.includes("words") || !tabs.includes("mwe")) { probe.close(); continue; }
          const meta = {};
          if (tabs.includes("meta")) {
            for (const r of probe.prepare("SELECT key,value FROM meta").all()) meta[r.key] = r.value;
          }
          probe.close();
          const alias = `pack${n++}`;
          this.user.exec(`ATTACH DATABASE '${full.replace(/'/g, "''")}' AS ${alias}`);
          this.packs.push({
            alias,
            id: meta.id || f.replace(/\.sqlite$/i, ""),
            name: meta.name || f.replace(/\.sqlite$/i, ""),
            license: meta.license || "",
            source: meta.source || "",
            file: f,
          });
        } catch (e) {
          try { probe?.close(); } catch { /* 忽略坏包 */ }
          console.warn(`[packs] 词包挂载失败，已跳过 ${f}: ${e.message}`);
        }
      }
    }
  }

  // 构建内存词表：L0 dict 先填，词包只补缺；词包中与 dict 同词头的行作为「补充义项」挂 packExtra
  buildLexicon() {
    this.words = new Map();    // word(lower) -> 库别名（'dict' / 'packN'）
    this.mwes = new Map();     // phrase(lower) -> 库别名
    this.mweNorm = new Map();  // 连字符归一后的短语 -> {phrase(规范显示形), alias}
    this.lemmaOf = new Map();  // flexion -> lemma
    this.ruleCache = new Map(); // S8：规则屈折回退缓存（flexion -> lemma 或 ""）
    this.packExtra = new Map();// word(lower) -> [{alias,id,name,pos,translation,definition,tag}]

    const fillWords = (alias) => {
      const rows = this.user.prepare(`SELECT word,translation FROM ${alias}.words`).all();
      for (const r of rows) {
        const w = r.word.toLowerCase();
        if (!this.words.has(w)) this.words.set(w, alias);
      }
    };
    const fillMwes = (alias) => {
      const rows = this.user.prepare(`SELECT phrase FROM ${alias}.mwe`).all();
      for (const r of rows) {
        const p = r.phrase.toLowerCase();
        if (!this.mwes.has(p)) {
          this.mwes.set(p, alias);
          const n = normPhrase(p);
          if (!this.mweNorm.has(n)) this.mweNorm.set(n, { phrase: p, alias });
        }
      }
    };
    const fillLemma = (alias) => {
      try {
        for (const r of this.user.prepare(`SELECT flexion,lemma FROM ${alias}.lemma`).all()) {
          if (!this.lemmaOf.has(r.flexion.toLowerCase())) this.lemmaOf.set(r.flexion.toLowerCase(), r.lemma.toLowerCase());
        }
      } catch { /* 词包允许无 lemma 表 */ }
    };

    fillWords("dict"); fillMwes("dict"); fillLemma("dict");
    const packById = new Map(this.packs.map((p) => [p.alias, p]));
    for (const p of this.packs) {
      // 词包独有词头
      const wRows = this.user.prepare(
        `SELECT word,phonetic,pos,translation,definition,tag,bnc,frq FROM ${p.alias}.words`
      ).all();
      for (const r of wRows) {
        const w = r.word.toLowerCase();
        if (!this.words.has(w)) this.words.set(w, p.alias);
        else if ((r.translation || "").trim()) {
          // 同词头补充义项（如 transformer 的 ML 义），按词包+译文去重
          const list = this.packExtra.get(w) || [];
          if (!list.some((x) => x.alias === p.alias && x.translation === r.translation)) {
            list.push({ alias: p.alias, id: p.id, name: p.name, pos: r.pos || "", translation: r.translation, definition: r.definition || "", tag: r.tag || "" });
            this.packExtra.set(w, list);
          }
        }
      }
      fillMwes(p.alias);
      fillLemma(p.alias);
    }
  }

  // 跨层查词头行（别名 -> 对应库的 words 表）
  // 批量取音标（不记 lookup 日志）：供「转为练习」发音资产自动填 IPA。
  phoneticsFor(wordsArr) {
    const out = [];
    for (const w0 of wordsArr) {
      const w = String(w0 || "").toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, "");
      if (!w) { out.push(null); continue; }
      let row = this.lookupWordRow("dict", w);
      if (!row) {
        let lem = this.lemmaOf.get(w);
        if (!lem) { try { lem = this.ruleLemma(w); } catch { lem = null; } }
        if (lem) row = this.lookupWordRow("dict", lem);
      }
      out.push(row?.phonetic || null);
    }
    return out;
  }
  lookupWordRow(alias, w) {
    return this.user.prepare(
      `SELECT word,phonetic,pos,translation,definition,tag,bnc,frq FROM ${alias}.words WHERE word=?`
    ).get(w);
  }

  // 词包来源徽章（去重，按挂载顺序）
  packBadges(alias, extra) {
    const out = [];
    const seen = new Set();
    const add = (a) => {
      if (a === "dict") return;
      const p = this.packs.find((x) => x.alias === a);
      if (p && !seen.has(p.id)) { seen.add(p.id); out.push({ id: p.id, name: p.name }); }
    };
    add(alias);
    for (const e of extra || []) add(e.alias);
    return out;
  }

  // S8：Morphy 子集规则屈折回退（只做屈折：复数/三单、-ed、-ing、比较级/最高级；不做派生）。
  // 优先级低于 dict/词包 lemma 表；候选必须是词表真实词头且 frq>0（零频多为专名/外语/生僻条目，
  // 如 ricas→rica、nidas→nida 必须挡住），多候选取 frq 最高；结果（含否定）缓存并回写 lemmaOf。
  ruleLemma(w0) {
    if (this.ruleCache.has(w0)) return this.ruleCache.get(w0) || null;
    const cands = new Set();
    const add = (s) => { if (s && s !== w0 && s.length >= 3 && this.words.has(s)) cands.add(s); };
    if (w0.length > 4 && /ies$/.test(w0)) { add(w0.slice(0, -3) + "y"); add(w0.slice(0, -2)); } // studies→study
    if (/(ses|xes|zes|ches|shes)$/.test(w0)) add(w0.slice(0, -2));                                 // boxes/cases/lenses
    if (w0.length > 3 && /s$/.test(w0) && !/(ss|us|is)$/.test(w0)) add(w0.slice(0, -1));           // 普通复数/三单
    if (w0.length > 4 && /ied$/.test(w0)) add(w0.slice(0, -3) + "y");                              // studied→study
    if (/ed$/.test(w0)) {
      add(w0.slice(0, -2)); add(w0.slice(0, -1));                                                  // played / liked
      if (w0.length > 4 && w0[w0.length - 3] === w0[w0.length - 4]) add(w0.slice(0, -3));          // stopped→stop
    }
    if (/ing$/.test(w0)) {
      add(w0.slice(0, -3) + "e"); add(w0.slice(0, -3));                                           // liking / playing
      if (w0.length > 5 && w0[w0.length - 4] === w0[w0.length - 5]) add(w0.slice(0, -4));         // running→run
    }
    if (w0.length > 4 && /ly$/.test(w0)) add(w0.slice(0, -2));                                    // adversarially→adversarial
    if (/ier$/.test(w0)) add(w0.slice(0, -3) + "y");                                               // happier→happy
    if (/iest$/.test(w0)) add(w0.slice(0, -4) + "y");
    if (w0.length > 4 && /er$/.test(w0)) {
      add(w0.slice(0, -2)); add(w0.slice(0, -1));                                                  // taller / larger
      if (w0[w0.length - 3] === w0[w0.length - 4]) add(w0.slice(0, -3));                           // bigger→big
    }
    if (w0.length > 5 && /est$/.test(w0)) {
      add(w0.slice(0, -3)); add(w0.slice(0, -2));                                                  // tallest / largest
      if (w0[w0.length - 4] === w0[w0.length - 5]) add(w0.slice(0, -4));
    }
    let pick = "", bestFrq = 0;
    for (const c of cands) {
      const alias = this.words.get(c);
      const f = this.lookupWordRow(alias, c)?.frq || 0;
      if (f > bestFrq) { bestFrq = f; pick = c; }
    }
    const result = bestFrq > 0 ? pick : ""; // frq>0 硬门控：宁可不还原，不制造假词元
    this.ruleCache.set(w0, result);
    if (result) this.lemmaOf.set(w0, result);
    return result || null;
  }

  // S8：token(lower，可含弯引号) → 可解析词头；不可解析返回 null。
  // 顺序：本词 → n't 缩约 → 's/'re 等截尾 → lemma 表 → 规则屈折回退
  canonical(low0) {
    const low = normApos(low0);
    const nt = NT_EXPAND.get(low);
    if (nt && this.words.has(nt)) return nt;
    const ap = low.lastIndexOf("'");
    if (ap > 0 && CONTRACTIONS.has(low.slice(ap + 1))) {
      const left = low.slice(0, ap);
      if (this.words.has(left)) return left;
    }
    // ECDICT 为屈折形式也建了 frq=0 词头（如 investigators 的 exchange 为 0:investigator/1:s），
    // 不能因为词头存在就直接返回表层形：零频屈折词头优先还原到 lemma 表指向的原形，
    // 避免单复数分裂成两个词元、已学复数判不出来、漏网词计数分散。
    const mapped = this.lemmaOf.get(low);
    // 词头自身 exchange 的 0:base 最权威（也能避开 lemma 表反向垃圾，如 bustier→bustiers）
    const exBase = this.exchangeZeroBase(low);
    if (exBase && exBase !== low && this.words.has(exBase)) {
      const a = Number(this.user.prepare("SELECT frq FROM dict.words WHERE word=?").get(low)?.frq) || 0;
      const b = Number(this.user.prepare("SELECT frq FROM dict.words WHERE word=?").get(exBase)?.frq) || 0;
      if (b > 0 && (a === 0 || b < a)) return exBase;
    }
    if (mapped && mapped !== low && this.words.has(mapped) && this.isInflectedHead(low, mapped)) return mapped;
    if (this.words.has(low)) return low;
    if (mapped && this.words.has(mapped)) return mapped;
    if (!/['-]/.test(low)) return this.ruleLemma(low);
    return null;
  }

  // 该词头是否应视为屈折形式：① frq 为空/0 的屈折条目（investigators）；
  // ② exchange 带 0:<base>/1:<码> 屈折标记（quicker/studying，即使高频也还原；people/data 无标记则保持自身）
  isInflectedHead(w, base) {
    if (!this._inflCache) this._inflCache = new Map();
    const key = w + ">" + base;
    if (this._inflCache.has(key)) return this._inflCache.get(key);
    const alias = this.words.get(w);
    const row = alias ? this.lookupWordRow(alias, w) : null;
    let isInfl = !row || !(Number(row.frq) > 0);
    if (!isInfl) {
      const ex = this.user.prepare("SELECT exchange FROM dict.words WHERE word=?").get(w)?.exchange || "";
      const m0 = ex.match(/(?:^|\/)0:([^/]+)/);
      isInfl = !!(m0 && m0[1].toLowerCase() === base);
    }
    this._inflCache.set(key, isInfl);
    return isInfl;
  }

  // 词头自身 exchange 声明的 0:<base> 原形（缓存）
  exchangeZeroBase(w) {
    if (!this._exBaseCache) this._exBaseCache = new Map();
    if (this._exBaseCache.has(w)) return this._exBaseCache.get(w);
    let base = null;
    const r = this.user.prepare("SELECT exchange FROM dict.words WHERE word=?").get(w);
    if (r && r.exchange) {
      const m0 = r.exchange.match(/(?:^|\/)0:([^/]+)/);
      if (m0) base = m0[1].toLowerCase();
    }
    this._exBaseCache.set(w, base);
    return base;
  }

  resolvable(w) {
    return !!this.canonical(String(w).toLowerCase());
  }

  resolve(word, label, phrase) {
    const low = normApos(word.toLowerCase());
    if (label === "mwe") {
      const p = (phrase || low).toLowerCase();
      const alias = this.mwes.get(p);
      if (alias) {
        const r = this.user
          .prepare(`SELECT phrase, translation, pos, tag FROM ${alias}.mwe WHERE phrase=?`)
          .get(p);
        if (r) return {
          word: r.phrase, lemma: r.phrase.toLowerCase(), phonetic: "", pos: r.pos,
          translation: r.translation, definition: "", tag: r.tag, bnc: 0, frq: 0,
          isMwe: true, layers: this.packBadges(alias),
        };
      }
      // 连字符归一兜底：传入原文未走 annotate（如直接 API 调用 dot-product）
      const norm = this.mweNorm.get(normPhrase(p));
      if (norm) {
        const r = this.user
          .prepare(`SELECT phrase, translation, pos, tag FROM ${norm.alias}.mwe WHERE phrase=?`)
          .get(norm.phrase);
        if (r) return {
          word: r.phrase, lemma: r.phrase.toLowerCase(), phonetic: "", pos: r.pos,
          translation: r.translation, definition: "", tag: r.tag, bnc: 0, frq: 0,
          isMwe: true, layers: this.packBadges(norm.alias),
        };
      }
    }
    const candidates = [low];
    if (!this.words.has(low)) {
      // S8：n't 缩约（didn't→did、won't→will）→ 's/'re 等截尾（world's→world）
      const nt = NT_EXPAND.get(low);
      if (nt) candidates.push(nt);
      const ap = low.lastIndexOf("'");
      if (ap > 0 && CONTRACTIONS.has(low.slice(ap + 1))) candidates.push(low.slice(0, ap));
      // lemma 表（同形优先已由 words.has(low) 在外层保证，规避 eagle→eagled 反向条目）
      const lem = this.lemmaOf.get(low) || (!/['-]/.test(low) ? this.ruleLemma(low) : null);
      if (lem && this.words.has(lem)) candidates.push(lem);
    }
    for (const w of candidates) {
      const alias = this.words.get(w);
      if (!alias) continue;
      const r = this.lookupWordRow(alias, w);
      if (r) {
        const extra = this.packExtra.get(w) || [];
        let translation = r.translation || "";
        let definition = r.definition || "";
        // 词包补充义项追加在 L0 释义之后（保留 L0 原序，包义按挂载顺序）
        for (const e of extra) {
          for (const line of (e.translation || "").split("\\n").map((s) => s.trim()).filter(Boolean)) {
            if (!translation.split("\\n").includes(line)) translation = (translation ? translation + "\\n" : "") + line;
          }
          if (e.definition && !definition.includes(e.definition)) {
            definition = (definition ? definition + "\\n" : "") + e.definition;
          }
        }
        return {
          word: r.word, lemma: r.word.toLowerCase(), phonetic: r.phonetic || "",
          pos: r.pos, translation, definition: definition || "", tag: r.tag,
          bnc: r.bnc, frq: r.frq, isMwe: false, layers: this.packBadges(alias, extra),
        };
      }
    }
    return null;
  }

  annotate(text) {
    // 词 token + 标点/空格 token（punct）一起输出，保证原文零丢失、可正常换行
    const re = new RegExp(WORD_RE.source, "g");
    const words = [];
    let m;
    while ((m = re.exec(text)) !== null) words.push({ start: m.index, text: m[0], label: "", sentStart: false, phrase: null });

    let prevEnd = 0;
    for (const tk of words) {
      const gap = text.slice(prevEnd, tk.start);
      tk.sentStart = prevEnd === 0 || /[.!?]/.test(gap);
      prevEnd = tk.start + tk.text.length;
    }

    let skipUntil = 0;
    for (let idx = 0; idx < words.length; idx++) {
      if (idx < skipUntil) continue;
      let hit = null;
      for (let w = 5; w >= 2; w--) {
        if (idx + w <= words.length) {
          const joined = words.slice(idx, idx + w).map((t) => t.text.toLowerCase()).join(" ");
          const m = this.mweNorm.get(normPhrase(joined));
          if (m) { hit = { w, phrase: m.phrase }; break; }
        }
      }
      // 单词 token 内含连字符（self-attention / dot-product）：归一后可能命中 MWE
      if (!hit && HYPHEN_TEST.test(words[idx].text)) {
        const m = this.mweNorm.get(normPhrase(words[idx].text.toLowerCase()));
        if (m) hit = { w: 1, phrase: m.phrase };
      }
      if (hit) {
        for (let k = 0; k < hit.w; k++) words[idx + k].label = "mwe";
        words[idx].phrase = hit.phrase;
        skipUntil = idx + hit.w;
      }
    }

    // 邮箱 / URL 区间：区间内 token 一律按专名处理（不标红、不进生词；论文页眉的邮箱柄如 lukaszkaiser）
    const neutralSpans = [];
    let nm;
    NEUTRAL_SPAN_RE.lastIndex = 0;
    while ((nm = NEUTRAL_SPAN_RE.exec(text)) !== null) neutralSpans.push([nm.index, nm.index + nm[0].length]);
    const inNeutral = (tk) => neutralSpans.some(([a, b]) => tk.start >= a && tk.start + tk.text.length <= b);

    for (let idx = 0; idx < words.length; idx++) {
      if (words[idx].label) continue;
      const { text: raw, sentStart } = words[idx];
      const low = normApos(raw.toLowerCase());
      if (inNeutral(words[idx])) { words[idx].label = "proper"; continue; }
      if (/[0-9]/.test(raw)) { words[idx].label = "number"; continue; }
      const isCap = CAP_RE.test(raw[0]);
      const allCaps = raw.length > 1 && raw === raw.toUpperCase() && CAP_RE.test(raw);
      const inDict = this.words.has(low);
      if (allCaps) {
        // 全大写但词典/词包可解（BLEU、WMT、RNN、NASA 等缩写词）按词处理，否则才是专名
        words[idx].label = this.resolvable(low) ? "cap_word" : "proper";
        continue;
      }
      if (inDict) { words[idx].label = isCap && !sentStart ? "cap_word" : "word"; }
      else {
        const ap = low.lastIndexOf("'");
        const suf = ap > 0 ? low.slice(ap + 1) : "";
        // S8：弯引号缩约/所有格与 n't 不规则缩约优先判为 contraction，再走通用可解析
        const isNt = NT_EXPAND.has(low) && this.words.has(NT_EXPAND.get(low));
        const isContr = isNt || (ap > 0 && CONTRACTIONS.has(suf) && this.resolvable(low.slice(0, ap)));
        if (isContr) { words[idx].label = "contraction"; }
        else if (this.resolvable(low)) { words[idx].label = "word_lemma"; }
        else if (low.includes("-") && low.split("-").filter(Boolean).every((p) => this.resolvable(p))) { words[idx].label = "compound"; }
        else {
          // 句首大写且词典无解：若紧随的下一个词也大写（"Łukasz Kaiser"、"Xception: Deep"），
          // 视为姓名/标题序列标专名；否则仍按生词（句首大写的普通未知词不能放过）
          const nextW = words[idx + 1];
          const prevW = words[idx - 1];
          // 姓名/标题序列：后继词也大写（"Łukasz Kaiser"、"Xception: Deep"），
          // 或前一个词是单字母大写缩写名首字母（"M. Sugiyama"，句点会使本词被判为句首）
          const nameSeq = isCap && sentStart && ((nextW && !nextW.sentStart && CAP_RE.test(nextW.text[0]))
            || (prevW && /^\p{Lu}$/u.test(prevW.text)));
          words[idx].label = (isCap && !sentStart) || nameSeq ? "proper" : "miss";
        }
      }
      // 旧词重现：该词（或其词元/缩约主体）已在词元库中
      const lem = this.canonical(low);
      if (this.learned.has(low) || (lem && this.learned.has(lem))) words[idx].learned = true;
      // AWL 学术词标记（先按词形，再按还原后 lemma）
      const fam = AWL_BY_FORM.get(low) || (lem && AWL_BY_FORM.get(lem));
      if (fam) words[idx].awl = fam.s;
    }

    // 合并：词 token 之间夹标点/空格 token
    const out = [];
    let pos = 0;
    let i = 0;
    let oi = 0;
    while (pos < text.length || i < words.length) {
      if (i < words.length && words[i].start === pos) {
        const t = words[i];
        out.push({ i: oi++, text: t.text, label: t.label, start: t.start, phrase: t.phrase || null, learned: !!t.learned, awl: t.awl || 0 });
        pos = t.start + t.text.length;
        i++;
      } else {
        const end = i < words.length ? words[i].start : text.length;
        if (end > pos) {
          out.push({ i: oi++, text: text.slice(pos, end), label: "punct", start: pos, phrase: null, learned: false });
          pos = end;
        } else {
          break;
        }
      }
    }
    return out;
  }

  saveText(text, title) {
    const norm = jsNorm(text);
    const existing = this.user.prepare("SELECT id, raw_text FROM texts WHERE norm_text=?").get(norm);
    if (existing) {
      if (existing.raw_text !== text) {
        // 同文不同排版（如内置素材升级为分段版）：就地升级，保留 id 与关联数据
        this.user.prepare("UPDATE texts SET raw_text=?, title=? WHERE id=?").run(text, title, existing.id);
      }
      return existing.id;
    }
    this.user
      .prepare("INSERT INTO texts(title, raw_text, norm_text, created_at) VALUES(?,?,?,?)")
      .run(title, text, norm, nowMs());
    return Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
  }

  annotateAndSave(text, givenTitle, source = null) {
    // ADR-4：外部来源（网页/RSS/文件/粘贴/扩展）在入库边界统一解码 HTML 实体；内置素材不动
    if (!source || source.kind !== "builtin") text = decodeHtmlEntities(text);
    const tokens = this.annotate(text);
    const title = givenTitle || text.trim().slice(0, 24);
    const text_id = this.saveText(text, title);

    // 旧词重现统计 + 每个重现词元写一次证据（同文去重）
    const wordToks = tokens.filter((t) => t.label !== "punct");
    const learnedToks = tokens.filter((t) => t.learned);
    const awlToks = wordToks.filter((t) => t.awl);
    const uniq = new Set(learnedToks.map((t) => {
      const low = normApos(t.text.toLowerCase());
      return this.learned.has(low) ? low : this.canonical(low);
    }));
    // S6：全文 CEFR（与好文摘要同一口径 tokenLevel 中位数；专名/数字/punct 不计分母）
    const lexicalToks = wordToks.filter((t) => t.label !== "proper" && t.label !== "number");
    const cefr = this.textCefr(lexicalToks);
    const stats = {
      words: wordToks.length,
      learnedTokens: learnedToks.length,
      learnedUnique: uniq.size,
      rate: wordToks.length ? +((learnedToks.length / wordToks.length) * 100).toFixed(1) : 0,
      awlTokens: awlToks.length,
      awlUnique: new Set(awlToks.map((t) => {
        const low = normApos(t.text.toLowerCase());
        const lem = this.canonical(low);
        return AWL_BY_FORM.get(low)?.h || (lem && AWL_BY_FORM.get(lem)?.h);
      }).filter(Boolean)).size,
      awlRate: wordToks.length ? +((awlToks.length / wordToks.length) * 100).toFixed(1) : 0,
      lexicalWords: lexicalToks.length,
      cefr,
    };
    this.user.prepare("UPDATE texts SET stats_json=? WHERE id=?").run(JSON.stringify(stats), text_id);
    if (source) this.addTextSource(text_id, source);
    const insEv = this.user.prepare(`INSERT INTO evidence_log(lexeme_id,dimension,result,source_type,source_ref,card_id,created_at)
      SELECT ?,'reading_recognition','ok','resurface',?,NULL,?
      WHERE NOT EXISTS (SELECT 1 FROM evidence_log WHERE lexeme_id=? AND source_type='resurface' AND source_ref=?)`);
    const lexId = this.user.prepare("SELECT id FROM lexemes WHERE lemma=?");
    for (const lem of uniq) {
      const row = lexId.get(lem);
      if (row) insEv.run(row.id, String(text_id), nowMs(), row.id, String(text_id));
    }
    // S9-1：漏网词相遇事实 + 不可变首标覆盖率快照
    this.recordUnknownEncounters(text_id, tokens);
    this.recordFirstCoverage(text_id, stats);
    return { text_id, tokens, stats };
  }

  // S6：全文 CEFR——词汇 token 按 ECDICT tag/频度定级的中位数；<8 个词汇词不估（返回 null）
  textCefr(lexicalToks) {
    if (lexicalToks.length < 8) return null;
    const BAND = { 2: "B1", 3: "B2", 4: "C1", 5: "C2" };
    const levels = lexicalToks
      .map((t) => this.tokenLevel(t.text.toLowerCase(), t.label))
      .sort((a, b) => a - b);
    return BAND[levels[Math.floor(levels.length / 2)]] || null;
  }

  // S6：文章来源（builtin/feed/url/file/paste/extension）。同一 (text,kind,external_ref) 幂等，一篇可多来源
  addTextSource(textId, source) {
    const kind = String(source?.kind || "").trim();
    if (!TEXT_SOURCE_KINDS.includes(kind)) throw new Error(`未知文章来源类型: ${kind}`);
    const row = this.user.prepare("SELECT id FROM texts WHERE id=?").get(textId);
    if (!row) throw new Error("文章不存在，无法记录来源");
    const label = String(source.label || "").slice(0, 200);
    const uri = String(source.uri || "").slice(0, 1000);
    const externalRef = String(source.externalRef ?? source.uri ?? "").slice(0, 500);
    this.user
      .prepare(`INSERT INTO text_sources(text_id,kind,label,uri,external_ref,imported_at)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(text_id,kind,external_ref) DO UPDATE SET
          label=excluded.label, uri=excluded.uri`)
      .run(textId, kind, label, uri, externalRef, nowMs());
    return this.listSources(textId);
  }

  listSources(textId) {
    return this.user
      .prepare("SELECT kind,label,uri,external_ref AS externalRef,imported_at AS importedAt FROM text_sources WHERE text_id=? ORDER BY imported_at")
      .all(textId);
  }

  // S6：历史文章来源回填（幂等）。好文导入经 feed_items.text_id；内置素材按 norm_text 匹配
  backfillSources() {
    // 1) 好文 feed 导入
    const feedRows = this.user
      .prepare(`SELECT fi.text_id AS text_id, fi.feed_id AS feed_id, fi.guid AS guid, fi.link AS link,
                       fi.title AS item_title, f.title AS feed_title
                FROM feed_items fi JOIN feeds f ON f.id=fi.feed_id
                WHERE fi.text_id IS NOT NULL`)
      .all();
    for (const r of feedRows) {
      this.user
        .prepare(`INSERT INTO text_sources(text_id,kind,label,uri,external_ref,imported_at)
          VALUES(?,?,?,?,?,?)
          ON CONFLICT(text_id,kind,external_ref) DO UPDATE SET label=excluded.label, uri=excluded.uri`)
        .run(r.text_id, "feed", r.feed_title || "", r.link || "", `${r.feed_id}|${r.guid}`, nowMs());
    }
    // 2) 内置素材
    for (const b of this.builtins) {
      const t = this.user.prepare("SELECT id FROM texts WHERE norm_text=?").get(jsNorm(b.text));
      if (t) {
        this.user
          .prepare(`INSERT INTO text_sources(text_id,kind,label,uri,external_ref,imported_at)
            VALUES(?,?,?,?,?,?)
            ON CONFLICT(text_id,kind,external_ref) DO UPDATE SET label=excluded.label`)
          .run(t.id, "builtin", b.title || "", "", b.id, nowMs());
      }
    }
  }

  // S6：旧库 stats_json 没有 cefr 字段，启动时按当前词库补算一次（不改 learned/证据以外的任何数据）
  backfillTextCefr() {
    const rows = this.user.prepare("SELECT id, raw_text, stats_json FROM texts").all();
    for (const r of rows) {
      let stats = null;
      try { stats = r.stats_json ? JSON.parse(r.stats_json) : null; } catch { stats = null; }
      if (stats && "cefr" in stats) continue;
      const tokens = this.annotate(r.raw_text);
      const lexical = tokens.filter((t) => t.label !== "punct" && t.label !== "proper" && t.label !== "number");
      const fresh = Object.assign({}, stats || { words: tokens.filter((t) => t.label !== "punct").length }, {
        lexicalWords: lexical.length,
        cefr: this.textCefr(lexical),
      });
      this.user.prepare("UPDATE texts SET stats_json=? WHERE id=?").run(JSON.stringify(fresh), r.id);
    }
  }

  // —— S4 每日好文：按摘要估算"对当前用户"的覆盖率与文本 CEFR（启发式 v0，口径写死可复算）——
  // 覆盖率 = 已建卡词 token / 词汇 token（专名与数字不计分母，避免人名稀释难度）；
  // CEFR = 全部词汇 token 按 ECDICT tag/频度定级后的中位数（与用户已学无关，是文本绝对难度）。
  tokenLevel(low0, label) {
    const low = normApos(low0);
    const lem = this.canonical(low) || low;
    const alias = this.words.get(lem) || this.words.get(low);
    let tag = "";
    let frq = 0;
    if (alias) {
      const row = this.lookupWordRow(alias, this.words.get(lem) ? lem : low);
      tag = row?.tag || "";
      frq = row?.frq || 0;
    }
    if (/\bgre\b/.test(tag)) return 5;          // C2
    if (/\btoefl\b/.test(tag)) return 4;        // C1
    if (/\b(ielts|cet6)\b/.test(tag)) return 3; // B2
    if (/\b(cet4|ky|zk|gk)\b/.test(tag)) return 2; // B1
    if (label === "miss") return 4;             // 词典查无：按难词处理
    if (alias) return frq >= 500 ? 2 : 3;       // 无级别标签：高频 B1、低频 B2
    return 3;
  }

  analyzeFeedItems({ limit = 30, recompute = false } = {}) {
    const rows = this.user.prepare(
      `SELECT feed_id,guid,summary FROM feed_items
       WHERE status!='dismissed' AND summary!=''
       ${recompute ? "" : "AND rate IS NULL"}
       ORDER BY published_at DESC LIMIT ?`,
    ).all(limit);
    const BAND = { 2: "B1", 3: "B2", 4: "C1", 5: "C2" };
    let analyzed = 0;
    for (const r of rows) {
      const lexical = this.annotate(r.summary)
        .filter((t) => t.label !== "punct" && t.label !== "proper" && t.label !== "number");
      if (lexical.length < 8) continue; // 摘要过短不估，等加入精读后用全文统计
      const knownN = lexical.filter((t) => t.learned).length;
      const rate = +((knownN / lexical.length) * 100).toFixed(1);
      const levels = lexical.map((t) => this.tokenLevel(t.text.toLowerCase(), t.label)).sort((a, b) => a - b);
      const cefr = BAND[levels[Math.floor(levels.length / 2)]] || "B2";
      this.feeds.setAnalysis(r.feed_id, r.guid, { words: lexical.length, known: knownN, rate, cefr });
      analyzed++;
    }
    return { analyzed, scanned: rows.length };
  }

  transForText(textId) {
    const r = this.user.prepare("SELECT raw_text FROM texts WHERE id=?").get(textId);
    if (!r) return null;
    const norm = jsNorm(r.raw_text);
    const b = this.builtins.find((x) => jsNorm(x.text) === norm);
    return b && Array.isArray(b.paras) && b.paras.length ? { paras: b.paras } : null;
  }

  // —— S7b：离线机翻按段缓存（migration v10）——
  static sourceShaOf(s) {
    return crypto.createHash("sha256").update(String(s ?? "")).digest("hex");
  }

  // 读取一篇文章全部已缓存段落（渲染层据此只翻缺口段落）
  translationGetAll(textId, srcLang = "en", dstLang = "zh") {
    return this.user
      .prepare(`SELECT para_index AS paraIndex, source_sha256 AS sourceSha, engine,
                       model_revision AS modelRevision, translated_text AS zh, pairs_json AS pairsJson,
                       status, updated_at AS updatedAt
                FROM text_translations WHERE text_id=? AND src_lang=? AND dst_lang=? ORDER BY para_index`)
      .all(textId, srcLang, dstLang)
      .map((r) => {
        let pairs = [];
        try { const v = JSON.parse(r.pairsJson); if (Array.isArray(v)) pairs = v; } catch { pairs = []; }
        return { paraIndex: r.paraIndex, sourceSha: r.sourceSha, engine: r.engine,
          modelRevision: r.modelRevision, zh: r.zh, pairs, status: r.status, updatedAt: r.updatedAt };
      });
  }

  //  upsert 一段译文；source 为该段英文原文（渲染层按 token 切分口径切出），按内容哈希做失效判断
  translationPut(p) {
    const textId = Number(p.textId);
    const paraIndex = Number(p.paraIndex);
    if (!Number.isInteger(paraIndex) || paraIndex < 0) throw new Error("段落序号非法");
    if (!this.user.prepare("SELECT id FROM texts WHERE id=?").get(textId)) throw new Error("文章不存在，无法保存译文");
    const source = String(p.source ?? "");
    if (!source.trim()) throw new Error("段落原文为空");
    const zh = String(p.translatedText ?? "");
    const status = p.status === "failed" ? "failed" : "ok";
    if (status === "ok" && !zh.trim()) throw new Error("译文为空");
    const pairs = [];
    if (Array.isArray(p.pairs)) {
      for (const pr of p.pairs) {
        if (pr && typeof pr[0] === "string" && typeof pr[1] === "string") pairs.push([pr[0], pr[1]]);
      }
    }
    const srcLang = /^[a-z]{2,3}(-[A-Za-z]+)?$/.test(p.srcLang || "") ? p.srcLang : "en";
    const dstLang = /^[a-z]{2,3}(-[A-Za-z]+)?$/.test(p.dstLang || "") ? p.dstLang : "zh";
    const engine = String(p.engine || "bergamot").slice(0, 40);
    const modelRevision = String(p.modelRevision || "").slice(0, 120);
    const sourceSha = Core.sourceShaOf(source);
    this.user
      .prepare(`INSERT INTO text_translations
          (text_id,para_index,source_sha256,src_lang,dst_lang,engine,model_revision,translated_text,pairs_json,status,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(text_id,para_index,src_lang,dst_lang) DO UPDATE SET
          source_sha256=excluded.source_sha256, engine=excluded.engine,
          model_revision=excluded.model_revision, translated_text=excluded.translated_text,
          pairs_json=excluded.pairs_json, status=excluded.status, updated_at=excluded.updated_at`)
      .run(textId, paraIndex, sourceSha, srcLang, dstLang, engine, modelRevision,
        zh, JSON.stringify(pairs), status, nowMs());
    return { textId, paraIndex, sourceSha, status };
  }

  // 删除某文全部机翻缓存（正文重新导入/来源文本变化时由渲染层调用）
  translationClear(textId) {
    const info = this.user.prepare("DELETE FROM text_translations WHERE text_id=?").run(textId);
    return { deleted: info.changes ?? 0 };
  }

  lookup(word, label, phrase, textId) {
    const r = this.resolve(word, label, phrase);
    if (!r) {
      // 专有名词/数字不进 SRS：给解释性占位，不返回 null（前端面板可展示，不建卡）
      if (label === "proper") {
        return {
          word, lemma: word.toLowerCase(), phonetic: "", pos: "", tag: "专有名词",
          translation: "专有名词（人名、地名、机构、作品或模型名等），通常不需要建卡",
          definition: "", bnc: 0, frq: 0, isMwe: false, layers: [], cardable: false,
          kind: "proper",
        };
      }
      if (label === "number") {
        return {
          word, lemma: word.toLowerCase(), phonetic: "", pos: "", tag: "数字",
          translation: "数字、年份或编号，不建卡",
          definition: "", bnc: 0, frq: 0, isMwe: false, layers: [], cardable: false,
          kind: "number",
        };
      }
      return null;
    }
    // 功能词（冠词/介词/连词/代词等封闭词类）不进 SRS，面板可查释义
    if (this.isFunctionLemma(r.lemma)) {
      return { ...r, cardable: false, kind: "function" };
    }
    // 查词追踪：每百词查词密度的数据源
    if (textId != null) {
      this.user
        .prepare("INSERT INTO lookup_log(word, text_id, created_at) VALUES(?,?,?)")
        .run(r.lemma.toLowerCase(), textId, nowMs());
    }
    return { ...r, cardable: true, kind: r.isMwe ? "mwe" : label };
  }

  dashboard() {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const todayStart = d0.getTime();
    const texts = this.user
      .prepare("SELECT id, title, created_at, stats_json FROM texts WHERE stats_json IS NOT NULL ORDER BY created_at DESC LIMIT 30")
      .all()
      .map((r) => {
        let s = null;
        try { s = JSON.parse(r.stats_json); } catch { s = null; }
        const lookups = this.user
          .prepare("SELECT COUNT(*) AS n FROM lookup_log WHERE text_id=?")
          .get(r.id).n;
        return {
          id: r.id, title: r.title, created_at: r.created_at,
          words: s?.words ?? 0, rate: s?.rate ?? 0, learnedUnique: s?.learnedUnique ?? 0,
          density: s?.words ? +((lookups / s.words) * 100).toFixed(1) : 0,
        };
      })
      .reverse();
    const byState = this.user.prepare("SELECT state, COUNT(*) AS n FROM cards GROUP BY state").all();
    const states = { new: 0, learning: 0, review: 0 };
    for (const r of byState) {
      if (r.state === 0) states.new = r.n;
      else if (r.state === 2) states.review = r.n;
      else states.learning += r.n;
    }
    const start = todayStart - 13 * DAY_MS;
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start + i * DAY_MS);
      return { day: `${d.getMonth() + 1}/${d.getDate()}`, n: 0 };
    });
    for (const r of this.user.prepare("SELECT rated_at FROM review_log WHERE rated_at>=?").all(start)) {
      const di = Math.min(13, Math.max(0, Math.floor((r.rated_at - start) / DAY_MS)));
      days[di].n++;
    }
    // 近 30 天词元累计增长
    const gStart = todayStart - 29 * DAY_MS;
    const growth = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(gStart + i * DAY_MS);
      return { day: `${d.getMonth() + 1}/${d.getDate()}`, n: 0 };
    });
    const before = this.user.prepare("SELECT COUNT(*) n FROM lexemes WHERE created_at<? AND pos <> '__concept__'").get(gStart).n;
    for (const r of this.user.prepare("SELECT created_at FROM lexemes WHERE created_at>=? AND pos <> '__concept__'").all(gStart)) {
      const di = Math.min(29, Math.max(0, Math.floor((r.created_at - gStart) / DAY_MS)));
      growth[di].n++;
    }
    let run = before;
    for (const g of growth) { run += g.n; g.total = run; }
    return {
      texts, states, reviews: days, growth,
      syllabus: this.syllabusList(),
      backup: this.backupStatus(),
      totals: { lexemes: this.learned.size, cards: this.user.prepare("SELECT COUNT(*) AS n FROM cards").get().n },
    };
  }

  // AWL 词族是否已学：任一词族成员（或其还原 lemma）在 lexemes 中
  awlFamilyLearned(fam) {
    for (const f of [fam.h, ...fam.f]) {
      if (this.learned.has(f)) return true;
      const lem = this.lemmaOf.get(f);
      if (lem && this.learned.has(lem)) return true;
    }
    return false;
  }

  // 考纲牌组总览：每个 tag 的词典总量 / 已学数（已学=存在同 lemma 词元）
  syllabusList() {
    const totalStmt = this.user.prepare("SELECT COUNT(*) n FROM dict.words WHERE ' '||tag||' ' LIKE ?");
    const learnedStmt = this.user.prepare(
      "SELECT COUNT(*) n FROM dict.words w WHERE ' '||w.tag||' ' LIKE ? AND EXISTS (SELECT 1 FROM lexemes l WHERE l.lemma=LOWER(w.word))"
    );
    return SYLLABUS_TAGS.map(([tag, label]) => {
      if (tag === "awl") {
        const learned = AWL.filter((fam) => this.awlFamilyLearned(fam)).length;
        return { tag, label, total: AWL.length, learned, rate: +((learned / AWL.length) * 100).toFixed(1) };
      }
      const like = "% " + tag + " %";
      const total = totalStmt.get(like).n;
      const learned = learnedStmt.get(like).n;
      return { tag, label, total, learned, rate: total ? +((learned / total) * 100).toFixed(1) : 0 };
    });
  }

  // 牌组词表：未学优先，其后按 COCA 词频降序；支持前缀/中文包含搜索与分页
  syllabusWords({ tag, q, offset }) {
    const off = pageOffset(offset);
    if (tag === "awl") return this.awlWords({ q: q || "", offset: off });
    const like = "% " + tag + " %";
    const where = ["' '||w.tag||' ' LIKE ?"];
    const args = [like];
    const kw = (q || "").trim();
    if (kw) {
      where.push("(LOWER(w.word) LIKE ? OR w.translation LIKE ?)");
      const pat = "%" + kw.toLowerCase() + "%";
      args.push(pat, "%" + kw + "%");
    }
    const whereSql = where.join(" AND ");
    const total = this.user.prepare(`SELECT COUNT(*) n FROM dict.words w WHERE ${whereSql}`).get(...args).n;
    const rows = this.user.prepare(
      `SELECT w.word, w.phonetic, w.pos, w.translation, w.definition, w.frq, w.bnc,
        EXISTS(SELECT 1 FROM lexemes l WHERE l.lemma=LOWER(w.word)) AS learned
       FROM dict.words w WHERE ${whereSql}
       ORDER BY learned ASC, w.frq DESC, w.word LIMIT ${SYLLABUS_PAGE} OFFSET ${off}`
    ).all(...args).map((r) => ({
      ...r,
      learned: !!r.learned,
      gloss: (r.translation || "").split("\\n")[0].slice(0, 48),
    }));
    return { total, offset: off, page: SYLLABUS_PAGE, rows };
  }

  // AWL 牌组词表：570 词族 join ECDICT 取音标释义；未学优先 → 子表 1..10 → 字母
  awlWords({ q, offset }) {
    const dictRow = this.user.prepare(
      "SELECT word, phonetic, pos, translation FROM dict.words WHERE word=? LIMIT 1"
    );
    const lookupHead = (h) => {
      const cands = [h, h.replace(/ise$/, "ize").replace(/our$/, "or")];
      for (const c of cands) { const r = dictRow.get(c); if (r) return r; }
      return null;
    };
    const kw = (q || "").trim().toLowerCase();
    const all = AWL.map((fam) => {
      const r = lookupHead(fam.h);
      const learned = this.awlFamilyLearned(fam);
      return {
        word: r ? r.word : fam.h, sub: fam.s, phonetic: r?.phonetic || "", pos: r?.pos || "",
        translation: r?.translation || "", learned,
        gloss: (r?.translation || "").split("\\n")[0].slice(0, 48),
      };
    }).filter((row) => !kw || row.word.includes(kw) || (row.translation || "").includes(q.trim()));
    all.sort((a, b) => (a.learned - b.learned) || (a.sub - b.sub) || a.word.localeCompare(b.word));
    return { total: all.length, offset, page: SYLLABUS_PAGE, rows: all.slice(offset, offset + SYLLABUS_PAGE) };
  }

  // 找/建词元，返回 lexemeId（阅读建卡与词表收录共用）
  // 内部：找到或新建词元，不触碰 learned 集合（供事务内调用，learned 在提交成功后再加）
  ensureLexeme(r, sense) {
    const lemma = r.lemma.toLowerCase();
    let lexemeId = this.user
      .prepare("SELECT id FROM lexemes WHERE lemma=? AND pos=? AND sense=?")
      .get(lemma, r.pos, sense)?.id ?? 0;
    if (!lexemeId) {
      this.user
        .prepare("INSERT INTO lexemes(lemma,pos,sense,tag,bnc,frq,created_at) VALUES(?,?,?,?,?,?,?)")
        .run(lemma, r.pos, sense, r.tag, r.bnc, r.frq, nowMs());
      lexemeId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
    }
    return lexemeId;
  }

  upsertLexeme(r, sense) {
    const lexemeId = this.ensureLexeme(r, sense);
    this.learned.add(r.lemma.toLowerCase()); // 同会话内立即生效（旧词重现/考纲已学）
    return lexemeId;
  }

  // 阅读中句子挖矿：语境句 + 认读/挖空/回忆三卡
  createNote({ word, label, phrase, sense, textId, offset }) {
    const now = nowMs();
    const r = this.resolve(word, label, phrase);
    if (!r) throw new Error(`未收录：${word}`);
    if (this.isFunctionLemma(r.lemma)) throw new Error(`功能词不建卡：${r.lemma}`);
    // 原文校验必须在建词元之前：反过来的话，文章已被删除时先落了一个 lexemes 行，留下无任何笔记的孤儿词元
    const rawRow = this.user.prepare("SELECT raw_text FROM texts WHERE id=?").get(textId);
    if (!rawRow) throw new Error("原文不存在（可能已被删除），请刷新后重试");
    const lexemeId = this.upsertLexeme(r, sense);
    // 是否在给"词表收录"的旧词卡补语境卡（用于前端提示）
    const hadStandalone = !!this.user
      .prepare("SELECT 1 AS x FROM notes WHERE lexeme_id=? AND text_id IS NULL LIMIT 1")
      .get(lexemeId);

    const raw = rawRow.raw_text;
    const sentence = extractSentence(raw, offset);

    const existing = this.user
      .prepare("SELECT id FROM notes WHERE lexeme_id=? AND context_sentence=?")
      .get(lexemeId, sentence)?.id ?? 0;
    if (existing) return { lexeme_id: lexemeId, note_id: existing, cards_created: 0, already: true };

    // 笔记 + 5 卡 + 证据同一事务：半写会留下"有笔记无卡"的词，该词永不进复习队列且无法自愈
    this.user.exec("BEGIN");
    try {
      this.user
        .prepare("INSERT INTO notes(lexeme_id,text_id,context_sentence,source,created_at) VALUES(?,?,?,'reading',?)")
        .run(lexemeId, textId, sentence, now);
      const noteId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
      let cards_created = 0;
      for (const ct of ["r_recog", "cloze", "recall", "l_recog", "spelling"]) {
        this.user
          .prepare("INSERT INTO cards(note_id,card_type,due,state,created_at) VALUES(?,?,?,0,?)")
          .run(noteId, ct, now, now);
        cards_created++;
      }
      this.user
        .prepare("INSERT INTO evidence_log(lexeme_id,dimension,result,source_type,source_ref,card_id,created_at) VALUES(?,'reading_recognition','ok','reader',?,NULL,?)")
        .run(lexemeId, String(textId), now);
      this.user.exec("COMMIT");
      return { lexeme_id: lexemeId, note_id: noteId, cards_created, already: false, merged: hadStandalone };
    } catch (e) {
      try { this.user.exec("ROLLBACK"); } catch { /* 已回滚则忽略 */ }
      throw e;
    }
  }

  // 词表收录（考纲页/无文章语境）：只生成不依赖句子的「释义→词」回忆卡；
  // 认读/挖空语境卡留待阅读中句子挖矿时补齐（同一词元可并存多条 note）
  createStandaloneNote({ word, label, phrase, sense }) {
    const now = nowMs();
    const r = this.resolve(word, label, phrase);
    if (!r) throw new Error(`未收录：${word}`);
    if (this.isFunctionLemma(r.lemma)) throw new Error(`功能词不建卡：${r.lemma}`);
    const lexemeId = this.upsertLexeme(r, sense);
    const PLACEHOLDER = "（从词表收录，暂无语境句；阅读中遇到后自动补语境卡）";
    const existing = this.user
      .prepare("SELECT id FROM notes WHERE lexeme_id=? AND text_id IS NULL")
      .get(lexemeId)?.id ?? 0;
    if (existing) return { lexeme_id: lexemeId, note_id: existing, cards_created: 0, already: true };
    this.user
      .prepare("INSERT INTO notes(lexeme_id,text_id,context_sentence,source,created_at) VALUES(?,NULL,?,'syllabus',?)")
      .run(lexemeId, PLACEHOLDER, now);
    const noteId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
    let created = 0;
    // 考纲收录：释义→词回忆卡 + 听音辨义卡 + 听写拼写卡（都不依赖语境句）；语境认读/挖空留待阅读挖矿补
    for (const ct of ["recall", "l_recog", "spelling"]) {
      this.user
        .prepare("INSERT INTO cards(note_id,card_type,due,state,created_at) VALUES(?,?,?,0,?)")
        .run(noteId, ct, now, now);
      created++;
    }
    return { lexeme_id: lexemeId, note_id: noteId, cards_created: created, already: false };
  }

  // 跟读问题词人工确认后进 SRS：目标句是跟读台里的真实英文句（自由文本，非 texts 行）。
  // 人工确认在前端完成（ADR-3：识别误差不自动算发音问题），这里只负责成卡。
  // 正确性铁律：①先做完全部输入校验再写库；②复用已有词元、不静默造空 sense 分身；③词元+笔记+5 卡同一事务，失败零残留。
  createShadowNote({ word, sentence, sense }) {
    // 1) 输入校验先于任何写入（避免空句也 upsert 词元污染词库）
    const sent = (sentence || "").trim();
    if (!sent) throw new Error("缺少跟读语境句");
    const r = this.resolve(word);
    if (!r) throw new Error(`未收录：${word}`);
    if (this.isFunctionLemma(r.lemma)) throw new Error(`功能词不建卡：${r.lemma}`);
    const lemma = r.lemma.toLowerCase();
    const want = (sense || "").trim();
    // 默认义项：中文优先；词包词（如 Wiktionary 扩展包）无中文时用英英释义首行并去掉 "n. "/"v. " 词性前缀
    const stripPos = (s) => s.replace(/^(n|v|adj|adv|det|pron|prep|conj|num|int|contr|part)\.\s*/i, "");
    const defaultSense = (r.translation || "").split("\\n").map((s) => s.trim()).find(Boolean)
      || ((r.definition || "").split("\\n").map((s) => stripPos(s.trim())).find(Boolean) || "");

    // 2) 词元归属：优先复用已有非 concept 词元，确定规则（传入 sense → 词典默认释义 → 最早一条），绝不新建空 sense 分身
    const exist = this.user
      .prepare("SELECT id,sense FROM lexemes WHERE lemma=? AND pos<>'__concept__' ORDER BY id")
      .all(lemma);
    let lexemeId = 0;
    let reused = false;
    if (exist.length) {
      lexemeId = (want && exist.find((x) => x.sense === want)?.id)
        || exist.find((x) => x.sense === defaultSense)?.id
        || exist[0].id;
      reused = true;
      const dup = this.user
        .prepare("SELECT id FROM notes WHERE lexeme_id=? AND context_sentence=?")
        .get(lexemeId, sent)?.id ?? 0;
      if (dup) return { lexeme_id: lexemeId, note_id: dup, cards_created: 0, already: true, merged: true };
    }

    // 3) 词元（如需新建，用传入 sense 或词典默认释义，不用空串）+ 笔记 + 5 卡，同一事务
    const now = nowMs();
    this.user.exec("BEGIN");
    let noteId, cards_created = 0, hadStandalone = false;
    try {
      if (!lexemeId) lexemeId = this.ensureLexeme(r, want || defaultSense);
      hadStandalone = !!this.user
        .prepare("SELECT 1 AS x FROM notes WHERE lexeme_id=? AND source='syllabus' LIMIT 1")
        .get(lexemeId);
      this.user
        .prepare("INSERT INTO notes(lexeme_id,text_id,context_sentence,source,created_at) VALUES(?,NULL,?,'shadow',?)")
        .run(lexemeId, sent, now);
      noteId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
      for (const ct of ["r_recog", "cloze", "recall", "l_recog", "spelling"]) {
        this.user
          .prepare("INSERT INTO cards(note_id,card_type,due,state,created_at) VALUES(?,?,?,0,?)")
          .run(noteId, ct, now, now);
        cards_created++;
      }
      this.user.exec("COMMIT");
    } catch (e) {
      try { this.user.exec("ROLLBACK"); } catch { /* 已回滚则忽略 */ }
      throw e;
    }
    this.learned.add(lemma); // 提交成功后才纳入会话已学
    return { lexeme_id: lexemeId, note_id: noteId, cards_created, already: false, merged: reused || hadStandalone };
  }

  // —— #139B 统一资产服务：captureAsset ——
  // 同一语言对象（identity_key）只建一次：命中 → 仅追加 encounter；卡片按工厂创建，全部同一事务。
  captureAsset(input) {
    const kind = input.asset_kind;
    const canonical = String(input.canonical || '').trim();
    const idem = String(input.idempotency_key || '').trim();
    // —— 输入校验（先于任何写入）——
    if (!ASSET_CARD_TYPES[kind]) throw new Error('asset_kind 非法');
    if (!canonical) throw new Error('canonical 不能为空');
    if (!idem) throw new Error('idempotency_key 不能为空');
    let payload = input.payload || {};
    if (typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload 必须是对象');
    let payloadJson;
    try { payloadJson = JSON.stringify(payload); JSON.parse(payloadJson); }
    catch { throw new Error('payload 不可序列化'); }
    if (kind === 'word' && !(Number(input.lexeme_id) > 0)) throw new Error('word 资产必须给 lexeme_id');
    if (kind !== 'word' && input.lexeme_id != null) throw new Error('非 word 资产不得挂 lexeme_id');
    const idInput = {
      lexeme_id: input.lexeme_id, canonical, payload,
      paper_id: input.paper_id ?? '', q_index: input.q_index ?? '',
      test_point: input.test_point || (payload && payload.test_point) || '',
    };
    const identity = assetIdentity(kind, idInput);
    const enc = input.encounter || null;
    if (enc && !['reading','conversation','shadow','exam','syllabus'].includes(enc.origin_kind))
      throw new Error('encounter.origin_kind 非法');
    let locatorJson = '{}', locatorHash = '';
    if (enc) {
      try { locatorJson = JSON.stringify(enc.locator || {}); JSON.parse(locatorJson); }
      catch { throw new Error('encounter.locator 非法'); }
      locatorHash = String(enc.locator_hash || shortHash(locatorJson));
    }
    // —— 操作重放：同 idempotency_key 已建过 → 直接回传，不写库 ——
    const prior = this.user.prepare('SELECT id FROM learning_assets WHERE idempotency_key=?').get(idem);
    if (prior) {
      return { asset_id: prior.id, created: false, cards_created: 0, encounter_added: false, replayed: true };
    }
    const now = nowMs();
    this.user.exec('BEGIN');
    let assetId, created = false, cardsCreated = 0, encounterAdded = false, relationsAdded = 0;
    try {
      const existing = this.user
        .prepare('SELECT id FROM learning_assets WHERE asset_kind=? AND identity_key=?')
        .get(kind, identity);
      if (existing) {
        assetId = existing.id;
      } else {
        this.user.prepare(`INSERT INTO learning_assets
          (asset_kind,canonical,gloss,payload_json,lexeme_id,identity_key,content_hash,status,created_at,confirmed_at,idempotency_key)
          VALUES(?,?,?,?,?,?,?, 'active',?, ?, ?)`)
          .run(kind, canonical, String(input.gloss || ''), payloadJson, input.lexeme_id ?? null,
            identity, String(input.content_hash || shortHash(canonical)), now,
            input.confirmed === false ? 0 : now, idem);
        assetId = Number(this.user.prepare('SELECT last_insert_rowid() AS id').get().id);
        created = true;
        for (const ct of ASSET_CARD_TYPES[kind]) {
          const dupCard = this.user
            .prepare('SELECT id FROM cards WHERE asset_id=? AND card_type=?').get(assetId, ct);
          if (dupCard) continue;
          this.user.prepare('INSERT INTO cards(asset_id,card_type,due,state,created_at) VALUES(?,?,?,0,?)')
            .run(assetId, ct, now, now);
          cardsCreated++;
        }
      }
      if (enc) {
        const dupEnc = this.user.prepare(`SELECT id FROM asset_encounters
          WHERE asset_id=? AND origin_kind=? AND origin_ref=? AND locator_hash=?`)
          .get(assetId, enc.origin_kind, String(enc.origin_ref || ''), locatorHash);
        if (!dupEnc) {
          this.user.prepare(`INSERT INTO asset_encounters
            (asset_id,origin_kind,origin_ref,locator_json,locator_hash,title_snapshot,sentence_snapshot,content_hash,source_status,encountered_at)
            VALUES(?,?,?,?,?,?,?,?, 'active',?)`)
            .run(assetId, enc.origin_kind, String(enc.origin_ref || ''), locatorJson, locatorHash,
              String(enc.title || ''), String(enc.sentence || ''), String(enc.content_hash || ''), now);
          encounterAdded = true;
        }
      }
      for (const rel of (input.relations || [])) {
        if (!['contains','exemplifies','pronunciation_of','variant_of'].includes(rel.rel)) continue;
        const target = this.user
          .prepare('SELECT id FROM learning_assets WHERE asset_kind=? AND identity_key=?')
          .get(rel.target_kind, rel.target_identity);
        if (!target || target.id === assetId) continue;
        this.user.prepare(`INSERT INTO asset_relations(from_asset,to_asset,rel,detail_json)
          VALUES(?,?,?, '{}') ON CONFLICT DO NOTHING`)
          .run(assetId, target.id, rel.rel);
        const ins = this.user.prepare('SELECT changes() AS n').get().n;
        relationsAdded += Number(ins);
      }
      this.user.exec('COMMIT');
    } catch (e) {
      try { this.user.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    }
    return { asset_id: assetId, created, cards_created: cardsCreated,
      encounter_added: encounterAdded, relations_added: relationsAdded, replayed: false };
  }

  // 发音产出卡（pron_production）只能由产出链（录音→对齐→人工确认）调用：
  addPronProductionCard(assetId) {
    const now = nowMs();
    const a = this.user.prepare("SELECT id FROM learning_assets WHERE id=? AND asset_kind='pronunciation'").get(assetId);
    if (!a) throw new Error('pronunciation 资产不存在');
    const dup = this.user.prepare('SELECT id FROM cards WHERE asset_id=? AND card_type=?').get(assetId, 'pron_production');
    if (dup) return { card_id: dup.id, created: false };
    this.user.prepare('INSERT INTO cards(asset_id,card_type,due,state,created_at) VALUES(?,?,?,0,?)')
      .run(assetId, 'pron_production', now, now);
    return { card_id: Number(this.user.prepare('SELECT last_insert_rowid() AS id').get().id), created: true };
  }

  // 按 canonical 查已有资产（发音重录链：判断是否可写 practice_observation/improved）
  findAssetByCanonical(kind, canonical) {
    if (!['word','chunk','grammar','pronunciation','concept'].includes(kind)) throw new Error('asset_kind 非法');
    const norm = normalizeExpression(canonical);
    if (!norm) return null;
    const rows = this.user.prepare('SELECT id, canonical FROM learning_assets WHERE asset_kind=?').all(kind);
    const hit = rows.find((r) => normalizeExpression(r.canonical) === norm);
    return hit ? Number(hit.id) : null;
  }

  // 追加一条能力证据（practice_observation/improved/used_* 等）；幂等键冲突回传 replayed
  addAssetEvidence(input) {
    const assetId = Number(input.asset_id);
    const ALLOWED = ['correct','partial','wrong','practice_observation','improved','recurred',
      'recognized','used_spontaneously','used_prompted','used_after_correction'];
    const result = String(input.result || '');
    if (!ALLOWED.includes(result)) throw new Error('result 非法');
    const a = this.user.prepare('SELECT id FROM learning_assets WHERE id=?').get(assetId);
    if (!a) throw new Error('资产不存在');
    const sourceKind = String(input.source_kind || '');
    if (!['reading','conversation','shadow','exam','syllabus','review'].includes(sourceKind))
      throw new Error('source_kind 非法');
    const dimension = String(input.dimension || '').slice(0, 100);
    if (!dimension) throw new Error('dimension 不能为空');
    const idem = String(input.idempotency_key || '').trim();
    if (!idem) throw new Error('idempotency_key 不能为空');
    let payloadJson = '{}';
    if (input.payload) {
      try { payloadJson = JSON.stringify(input.payload); }
      catch { throw new Error('payload 不可序列化'); }
    }
    const prior = this.user.prepare('SELECT id FROM asset_evidence WHERE idempotency_key=?').get(idem);
    if (prior) return { evidence_id: prior.id, replayed: true };
    const now = nowMs();
    this.user.prepare(`INSERT INTO asset_evidence
      (asset_id,dimension,result,source_kind,source_ref,payload_json,occurred_at,idempotency_key)
      VALUES(?,?,?,?,?,?,?,?)`)
      .run(assetId, dimension, result, sourceKind, String(input.source_ref || ''),
        payloadJson, now, idem);
    return { evidence_id: Number(this.user.prepare('SELECT last_insert_rowid() AS id').get().id), replayed: false };
  }

  // —— S13-a-2 会话复盘草稿（持久化、可恢复） ——
  debriefPut(o) {
    const originKind = String(o.origin_kind || '');
    if (!['reading','conversation','shadow','exam'].includes(originKind)) throw new Error('origin_kind 非法');
    const originRef = String(o.origin_ref || '');
    if (!originRef) throw new Error('origin_ref 不能为空');
    let candidatesJson = '[]';
    if (Array.isArray(o.candidates)) {
      try { candidatesJson = JSON.stringify(o.candidates); }
      catch { throw new Error('candidates 不可序列化'); }
    }
    const now = nowMs();
    const draftKey = originKind + ':' + originRef;
    this.user.prepare(`INSERT INTO debrief_drafts
      (draft_key,origin_kind,origin_ref,candidates_json,status,created_at,updated_at)
      VALUES(?,?,?,?, 'open',?,?)
      ON CONFLICT(draft_key) DO UPDATE SET
        candidates_json=excluded.candidates_json,
        status=CASE WHEN debrief_drafts.status='open' THEN 'open' ELSE debrief_drafts.status END,
        updated_at=excluded.updated_at`)
      .run(draftKey, originKind, originRef, candidatesJson, now, now);
    return { draft_key: draftKey };
  }

  debriefList() {
    return this.user.prepare(
      "SELECT * FROM debrief_drafts WHERE status='open' ORDER BY updated_at DESC").all();
  }

  debriefGet(draftKey) {
    return this.user.prepare("SELECT * FROM debrief_drafts WHERE draft_key=?").get(draftKey);
  }

  debriefSetStatus(draftKey, status) {
    if (!['open','done','skipped'].includes(status)) throw new Error('status 非法');
    const now = nowMs();
    this.user.prepare("UPDATE debrief_drafts SET status=?, updated_at=? WHERE draft_key=?")
      .run(status, now, draftKey);
    return this.debriefGet(draftKey);
  }

  // S13-c priority 有界加性分（algo v1）
  assetPriority(assetId, nowMs) {
    const now = nowMs || Date.now();
    const a = this.user.prepare("SELECT * FROM learning_assets WHERE id=?").get(assetId);
    if (!a) throw new Error("资产不存在");
    const parts = {
      overdue: 0, recurrence: 0, recent_error: 0,
      exam: 0, output_gap: 0, success_decay: 0,
    };
    const reasons = [];

    const cards = this.user.prepare("SELECT due FROM cards WHERE asset_id=?").all(assetId);
    let maxDays = 0;
    for (const c of cards) {
      if (c.due < now) {
        const d = (now - c.due) / 86400000;
        if (d > maxDays) maxDays = d;
      }
    }
    parts.overdue = maxDays <= 0 ? 0 : maxDays < 1 ? 1 : maxDays < 3 ? 2 : 3;
    if (parts.overdue) reasons.push("复习已逾期 " + (maxDays < 1 ? "<1" : maxDays.toFixed(1)) + " 天");

    const recN = this.user.prepare(
      "SELECT COUNT(*) n FROM asset_evidence WHERE asset_id=? AND result='recurred'").get(assetId).n;
    parts.recurrence = Math.min(3, recN);
    if (parts.recurrence) reasons.push("问题复发 " + recN + " 次");

    const since7 = now - 7 * 86400000;
    const errs = this.user.prepare(
      "SELECT result FROM asset_evidence WHERE asset_id=? AND occurred_at>=? AND result IN ('wrong','partial')")
      .all(assetId, since7);
    parts.recent_error = Math.min(2, errs.length);
    if (parts.recent_error) reasons.push("近 7 天有错误记录");

    if (a.asset_kind === "word" && a.lexeme_id) {
      const lx = this.user.prepare("SELECT lemma FROM lexemes WHERE id=?").get(a.lexeme_id);
      if (lx) {
        const w = this.user.prepare("SELECT tag FROM dict.words WHERE word=?")
          .get(lx.lemma.toLowerCase());
        if (w && w.tag && /(cet6|ky|ielts|toefl|gre)/.test(w.tag)) {
          parts.exam = 1; reasons.push("考纲词汇");
        }
      }
    }

    const usedN = this.user.prepare(
      "SELECT COUNT(*) n FROM asset_evidence WHERE asset_id=? AND result IN ('used_spontaneously','used_prompted','used_after_correction')")
      .get(assetId).n;
    const recognizedN = this.user.prepare(
      "SELECT COUNT(*) n FROM asset_evidence WHERE asset_id=? AND result IN ('recognized','correct','improved')")
      .get(assetId).n;
    if (usedN === 0 && recognizedN > 0) { parts.output_gap = 1; reasons.push("只会认不会用"); }

    const succN = this.user.prepare(
      "SELECT COUNT(*) n FROM asset_evidence WHERE asset_id=? AND occurred_at>=? AND result IN ('correct','improved','used_spontaneously')")
      .get(assetId, since7).n;
    parts.success_decay = Math.min(2, succN);

    const score = parts.overdue + parts.recurrence + parts.recent_error +
      parts.exam + parts.output_gap - parts.success_decay;
    return {
      asset_id: assetId, score: Math.max(0, score),
      parts, reasons, algo: "priority-v1",
    };
  }

  priorityList({ limit = 5, kinds } = {}) {
    const kf = (kinds && kinds.length)
      ? kinds : ["word", "chunk", "grammar", "pronunciation", "concept"];
    const ph = "(" + kf.map(() => "?").join(",") + ")";
    const rows = this.user.prepare(
      "SELECT id FROM learning_assets WHERE status='active' AND asset_kind IN " + ph)
      .all(...kf);
    const out = rows.map((r) => {
      const p = this.assetPriority(r.id);
      const row = this.user.prepare(
        "SELECT canonical,gloss,asset_kind FROM learning_assets WHERE id=?").get(r.id);
      return Object.assign(p, row);
    }).filter((p) => p.score > 0);
    out.sort((x, y) => (y.score - x.score) || (y.asset_id - x.asset_id));
    return out.slice(0, limit);
  }

  // S13-b-2 资产用出次数（卡背展示）  // S13-b-2 资产用出次数（卡背展示）
  assetUseCounts(assetId) {
    const out = {
      used_spontaneously: 0, used_prompted: 0,
      used_after_correction: 0, recognized: 0,
    };
    for (const r of this.user.prepare(
      "SELECT result, COUNT(*) n FROM asset_evidence WHERE asset_id=? GROUP BY result").all(assetId)) {
      if (Object.prototype.hasOwnProperty.call(out, r.result)) out[r.result] = r.n;
    }
    return out;
  }

  // S13-b-1 用出证据检测  // S13-b-1 用出证据检测：用户确认轮发送时匹配 word/chunk 资产，分类写证据
  detectUsedAssets({ sessionKey, turnKey, text, prompted }) {
    const out = [];
    const raw = String(text || "");
    if (!raw.trim()) return out;
    const cjk = (raw.match(/[\u4e00-\u9fff]/g) || []).length;
    const letters = (raw.match(/[A-Za-z]/g) || []).length;
    if (letters < 2 || cjk > letters) return out; // 中文轮/中英混说中文为主 → 不评估

    // 上一条 assistant 轮的纠错内容 → after_correction 判定
    let correctionText = "";
    const sess = this.user.prepare(
      "SELECT id FROM conversation_sessions WHERE session_key=?").get(sessionKey);
    if (sess) {
      const prev = this.user.prepare(
        "SELECT local_feedback_json,text FROM conversation_turns WHERE session_id=? AND role='assistant' ORDER BY seq DESC LIMIT 1").get(sess.id);
      if (prev) {
        try {
          const fb = JSON.parse(prev.local_feedback_json || "[]");
          if (Array.isArray(fb)) correctionText = fb.map((x) =>
            (x && (x.correction || x.suggestion || x.text || "")) || "").join(" ");
        } catch { correctionText = ""; }
        correctionText += " " + prev.text;
      }
    }
    const normCorrection = normalizeExpression(correctionText);

    const normRaw = normalizeExpression(raw);
    const tokens = raw.toLowerCase().match(/[a-z][a-z'’-]*/g) || [];
    const lemmas = new Set();
    for (const t of tokens) {
      lemmas.add(t);
      const l = this.lemmaOf.get(t);
      if (l) lemmas.add(l);
      else { try { const rl = this.ruleLemma(t); if (rl) lemmas.add(rl); } catch { /* */ } }
    }

    const promptedIds = Array.isArray(prompted) ? prompted : [];
    const classify = (asset, matchedVia, result) => {
      const tag = result === "used_spontaneously" ? "sp"
        : result === "used_prompted" ? "pr" : "ac";
      const idem = "used-" + tag + "-" + sessionKey + "-" + asset.id;
      try {
        const r = this.addAssetEvidence({
          asset_id: asset.id, dimension: asset.asset_kind + "_use",
          result, source_kind: "conversation", source_ref: turnKey,
          payload: { session_key: sessionKey }, idempotency_key: idem,
        });
        out.push({ asset_id: asset.id, result, replayed: r.replayed });
      } catch { /* 单条失败跳过 */ }
    };

    const wordAssets = this.user.prepare(
      "SELECT id,canonical FROM learning_assets WHERE asset_kind='word' AND status='active'").all();
    for (const a of wordAssets) {
      const canon = normalizeExpression(a.canonical);
      if (!canon || !lemmas.has(canon)) continue;
      const result = promptedIds.includes(a.id)
        ? "used_prompted"
        : (normCorrection && normCorrection.indexOf(canon) !== -1
          ? "used_after_correction" : "used_spontaneously");
      classify(a, canon, result);
    }
    const chunkAssets = this.user.prepare(
      "SELECT id,canonical,payload_json FROM learning_assets WHERE asset_kind='chunk' AND status='active'").all();
    for (const a of chunkAssets) {
      const variants = [a.canonical];
      try {
        const p = JSON.parse(a.payload_json || "{}");
        if (Array.isArray(p.variants)) variants.push(...p.variants);
      } catch { /* */ }
      let hit = null;
      for (const v of variants) {
        const nv = normalizeExpression(v);
        if (nv && normRaw.indexOf(nv) !== -1) { hit = nv; break; }
      }
      if (!hit) continue;
      const result = promptedIds.includes(a.id)
        ? "used_prompted"
        : (normCorrection && normCorrection.indexOf(hit) !== -1
          ? "used_after_correction" : "used_spontaneously");
      classify(a, hit, result);
    }
    return out;
  }

  // 本文复盘候选：查过、但本文尚未建卡（notes）的词，带词典释义  // 本文复盘候选：查过、但本文尚未建卡（notes）的词，带词典释义
  textDebriefCandidates(textId) {
    const rows = this.user.prepare(`SELECT DISTINCT word FROM lookup_log
      WHERE text_id=? ORDER BY id DESC`).all(textId);
    const trow = this.user.prepare("SELECT raw_text FROM texts WHERE id=?").get(textId);
    const rawText = trow && trow.raw_text ? trow.raw_text : "";
    const sentenceOf = (word) => {
      if (!rawText) return "";
      const sents = rawText.split(/(?<=[.!?])\s+/);
      const esc = String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let re;
      try { re = new RegExp("\\b" + esc + "\\b", "i"); } catch { return ""; }
      const hit = sents.find((sx) => re.test(sx));
      return hit ? hit.replace(/\s+/g, " ").trim() : "";
    };
    const out = [];
    const seen = new Set();
    for (const r of rows) {
      const w = String(r.word || '').trim();
      if (!w || seen.has(w.toLowerCase())) continue;
      seen.add(w.toLowerCase());
      const low = w.toLowerCase();
      // 点击词本身就是词典词目时以它为准（lemma 表个别脏行如 benefit→benefited 不采信）
      const selfHead = this.user.prepare(
        "SELECT 1 FROM dict.words WHERE word=?").get(low);
      let lem = this.lemmaOf.get(low);
      if (!lem) { try { lem = this.ruleLemma(low); } catch { lem = null; } }
      const base = selfHead ? low : (lem || low);
      const note = this.user.prepare(`SELECT 1 FROM notes n JOIN lexemes x ON x.id=n.lexeme_id
        WHERE n.text_id=? AND lower(x.lemma) IN (?,?)`).get(textId, low, base);
      if (note) continue;
      const drow = this.user.prepare(
        "SELECT translation FROM dict.words WHERE word=? AND translation<>''").get(base);
      const gloss = drow ? String(drow.translation).split("\\n")[0].trim() : "";
      out.push({ kind: 'word', canonical: base, clicked: w, gloss, sentence: sentenceOf(w) });
    }
    return out;
  }

  // 来源反向视图：本文已学词 / 各类资产 / 跟读通过句
  textLearnedSummary(textId) {
    const words = this.user.prepare(
      "SELECT COUNT(DISTINCT lexeme_id) n FROM notes WHERE text_id=?").get(textId).n;
    const assetRows = this.user.prepare(`SELECT a.asset_kind AS kind, COUNT(DISTINCT a.id) n
      FROM asset_encounters e JOIN learning_assets a ON a.id=e.asset_id
      WHERE e.origin_kind='reading' AND e.origin_ref=? AND e.source_status='active'
      GROUP BY a.asset_kind`).all(String(textId));
    const assets = {};
    for (const r of assetRows) assets[r.kind] = r.n;
    const shadowPass = this.user.prepare(
      "SELECT COUNT(*) n FROM shadow_sentences WHERE text_id=? AND status='active' AND COALESCE(best_similarity,0)>=80")
      .get(textId).n;
    return { words, assets, shadow_pass: shadowPass };
  }

  // 对话反向视图：本场沉淀资产（相遇）与用出证据分类计数
  conversationSummary(sessionKey) {
    const sess = this.user.prepare(
      "SELECT id FROM conversation_sessions WHERE session_key=?").get(sessionKey);
    const turns = sess ? this.user.prepare(
      "SELECT turn_key FROM conversation_turns WHERE session_id=? AND role='user'").all(sess.id) : [];
    const turnKeys = turns.map((t) => t.turn_key);
    let assets = 0; const assetKinds = {};
    const ev = { used_spontaneously: 0, used_prompted: 0, used_after_correction: 0, recognized: 0 };
    if (turnKeys.length) {
      const ph = '?,'.repeat(turnKeys.length).slice(0, -1);
      const aRows = this.user.prepare(`SELECT a.asset_kind AS kind, COUNT(DISTINCT a.id) n
        FROM asset_encounters e JOIN learning_assets a ON a.id=e.asset_id
        WHERE e.origin_kind='conversation' AND e.origin_ref IN (${ph})
        GROUP BY a.asset_kind`).all(...turnKeys);
      for (const r of aRows) { assets += r.n; assetKinds[r.kind] = r.n; }
      const eRows = this.user.prepare(`SELECT result, COUNT(*) n FROM asset_evidence
        WHERE source_kind='conversation' AND source_ref IN (${ph}) AND result IN
        ('used_spontaneously','used_prompted','used_after_correction','recognized')
        GROUP BY result`).all(...turnKeys);
      for (const r of eRows) ev[r.result] = r.n;
    }
    return { assets, assetKinds, evidence: ev };
  }

  // 释义四选一：正确项 + 3 个随机干扰项（取词典首条翻译），就地打乱
  // 四选一干扰项：同词性、频率带接近、排除近义泄漏（出现两个正确答案）与重复
  meaningChoices(correct, lemma) {
    const posOf = (gloss) => { const mm = /^\s*([a-z]{1,6})\./i.exec(gloss || ""); return mm ? mm[1].toLowerCase() : ""; };
    const headOf = (gloss) => { const mm = (gloss || "").match(/[一-鿿]{2,6}/); return mm ? mm[0] : ""; };
    const pos = posOf(correct);
    const head = headOf(correct);
    const selfRow = this.user.prepare("SELECT frq FROM dict.words WHERE word=?").get(lemma);
    const baseFrq = selfRow && selfRow.frq ? Number(selfRow.frq) : 0;
    const seen = new Set([correct]);
    const picked = [];
    const fill = (extraWhere, args) => {
      const rows = this.user
        .prepare(`SELECT translation FROM dict.words WHERE translation<>'' AND word<>? AND ${extraWhere} ORDER BY RANDOM() LIMIT 200`)
        .all(lemma, ...args);
      for (const x of rows) {
        const g = x.translation.split("\\n")[0].trim();
        if (!g || seen.has(g)) continue;
        const gPos = posOf(g);
        if (pos && gPos && gPos !== pos) continue;
        const gh = headOf(g);
        if (head && gh && (g.includes(head) || correct.includes(gh))) continue; // 近义/同义泄漏
        seen.add(g); picked.push(g);
        if (picked.length >= 3) break;
      }
    };
    if (baseFrq > 0) fill("frq>0 AND frq BETWEEN ? AND ?", [Math.max(1, Math.round(baseFrq / 4)), Math.round(baseFrq * 4)]);
    if (picked.length < 3) fill("frq>0", []);
    if (picked.length < 3) fill("tag<>''", []);
    if (picked.length < 3) fill("1=1", []);
    const choices = [correct, ...picked.slice(0, 3)];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return choices;
  }

  getDue(limit) {
    const now = nowMs();
    const todayStart = this.dayStart(now);
    let queue = this.user
      .prepare("SELECT id, note_id, asset_id, card_type, state FROM cards WHERE state!=0 AND due<=? ORDER BY due LIMIT ?")
      .all(now, limit);
    const introduced = this.user
      .prepare(`SELECT COUNT(*) AS n FROM cards c WHERE c.state!=0 AND EXISTS(
        SELECT 1 FROM review_log rl WHERE rl.card_id=c.id AND rl.rated_at>=?
        AND rl.id=(SELECT MIN(id) FROM review_log WHERE card_id=c.id))`)
      .get(todayStart).n;
    const newQuota = Math.max(0, Math.min(NEW_PER_DAY - introduced, limit));
    if (newQuota > 0) {
      const fresh = this.user
        .prepare("SELECT id, note_id, asset_id, card_type, state FROM cards WHERE state=0 ORDER BY created_at LIMIT ?")
        .all(newQuota);
      queue = queue.concat(fresh);
    }

    const seenOwners = new Set();
    const out = [];
    for (const row of queue) {
      // 归属键：词卡 note:<id>，资产卡 asset:<id>（asset 卡 note_id 为 NULL，不能再用 note_id 互埋）
      const ownerKey = row.note_id != null ? `note:${row.note_id}` : `asset:${row.asset_id}`;
      if (seenOwners.has(ownerKey)) continue; // 兄弟卡互埋
      seenOwners.add(ownerKey);
      let n, d;
      let a = null, payload = {};
      if (row.note_id != null) {
        n = this.user
          .prepare("SELECT n.context_sentence AS sentence, n.text_id AS text_id, l.lemma, l.sense FROM notes n JOIN lexemes l ON l.id=n.lexeme_id WHERE n.id=?")
          .get(row.note_id);
        if (!n) continue; // 笔记/词元行缺失（历史脏行）：跳过该卡，不能让整个复习队列抛错
        d = this.user
          .prepare("SELECT phonetic, exchange, definition, translation FROM dict.words WHERE word=?")
          .get(n.lemma) || { phonetic: "", exchange: "" };
      } else {
        // 资产卡：从 learning_assets 取通用 DTO；chunk/grammar/pron 的专属渲染在 #142
        a = this.user
          .prepare("SELECT asset_kind, canonical, gloss, payload_json FROM learning_assets WHERE id=?")
          .get(row.asset_id);
        if (!a) continue; // 悬空资产卡同上
        try { payload = JSON.parse(a.payload_json || "{}"); } catch { payload = {}; }
        n = {
          sentence: payload.example_en || a.gloss || a.canonical,
          text_id: null, lemma: a.canonical, sense: a.gloss,
        };
        d = { phonetic: "", exchange: "", definition: "", translation: "" };
      }
      let shown = n.sentence;
      let answer = n.lemma;
      let miss = false;
      let choices;
      let correctChoice = null;
      if (row.card_type === "chunk_recall") {
        // 词块回忆：正面英文词块，背面中文意图+例句
        shown = a.canonical; answer = a.gloss || payload.zh_intent || "";
      } else if (row.card_type === "chunk_cloze") {
        // 词块填空：例句中挖掉该词块
        const ex0 = payload.example_en || "";
        if (ex0) {
          const esc0 = a.canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          shown = ex0.replace(new RegExp(esc0, "i"), "_____");
        } else shown = a.canonical;
        answer = a.canonical;
      } else if (row.card_type === "grammar_pattern") {
        // 语法练习：正面题目，背面答案+解释
        shown = payload.prompt || a.canonical; answer = payload.answer || a.gloss || "";
      } else if (row.card_type === "pron_perception") {
        // 发音听辨：正面只播音（前端 TTS），背面文本+IPA
        shown = "听音辨发音"; answer = a.canonical;
      } else if (row.card_type === "concept_recall") {
        // 考点回忆：正面考点，背面策略/说明
        shown = payload.test_point || a.gloss || a.canonical;
        answer = a.gloss || payload.strategy || "";
      } else if (row.card_type === "concept") {
        // 错题概念卡：正面=错因+考点（sense），背面=题干/解析（context_sentence）
        shown = n.sense;
      } else if (row.card_type === "cloze") {
        const cl = buildCloze(this, n.sentence, n.lemma);
        shown = cl.text; answer = cl.answer; miss = cl.miss;
      } else if (row.card_type === "recall") {
        shown = n.sense || n.lemma;
        correctChoice = shown;
        choices = this.meaningChoices(correctChoice, n.lemma);
      } else if (row.card_type === "l_recog") {
        // 听音辨义：正面只播发音（前端 TTS），背面=单词；选项=释义四选一
        correctChoice = (n.sense || (d.translation || "").split("\\n")[0].trim() || n.lemma);
        shown = "听音选义"; answer = n.lemma;
        choices = this.meaningChoices(correctChoice, n.lemma);
      } else if (row.card_type === "spelling") {
        // 听写拼写：正面只播发音（前端 TTS），用户键入整个单词，背面=单词；无选项
        shown = "听音拼写"; answer = n.lemma;
      }
      out.push({
        card_id: row.id, note_id: row.note_id, asset_id: row.asset_id ?? null, card_type: row.card_type,
        asset_kind: row.asset_id != null ? a.asset_kind : null,
        payload: row.asset_id != null ? payload : null,
        sentence: shown, full: n.sentence, text_id: n.text_id ?? null, word: n.lemma,
        phonetic: d.phonetic || "", exchange: d.exchange || "", definition: d.definition || "",
        sense: n.sense, answer, clozeMiss: miss, state: row.state,
        choices, correctChoice,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  listLexemes(params = {}) {
    const now = nowMs();
    const off = pageOffset(params.offset);
    const kw = (params.q || "").trim();
    const where = ["l.pos <> '__concept__'"];
    const args = [];
    if (kw) {
      where.push("(l.lemma LIKE ? OR l.sense LIKE ?)");
      args.push("%" + kw.toLowerCase() + "%", "%" + kw + "%");
    }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    const total = this.user.prepare(`SELECT COUNT(*) n FROM lexemes l ${whereSql}`).get(...args).n;
    // 遗忘次数=该词元全部卡片 lapses 之和；相遇篇数=reader/resurface 证据里出现过的不同文章数
    const aggSql = `SELECT l.id, l.lemma, l.sense, l.tag, l.created_at,
        (SELECT COUNT(*) FROM cards c JOIN notes n ON n.id=c.note_id WHERE n.lexeme_id=l.id) AS cards,
        (SELECT COUNT(*) FROM cards c JOIN notes n ON n.id=c.note_id WHERE n.lexeme_id=l.id AND c.state!=0 AND c.due<=?) AS due,
        (SELECT COALESCE(SUM(c.lapses),0) FROM cards c JOIN notes n ON n.id=c.note_id WHERE n.lexeme_id=l.id) AS lapses,
        (SELECT COUNT(DISTINCT source_ref) FROM evidence_log e WHERE e.lexeme_id=l.id AND e.source_type IN ('reader','resurface') AND e.source_ref<>'') AS encounters,
        EXISTS(SELECT 1 FROM notes n WHERE n.lexeme_id=l.id AND n.text_id IS NOT NULL) AS has_reading,
        EXISTS(SELECT 1 FROM notes n WHERE n.lexeme_id=l.id AND n.text_id IS NULL) AS has_standalone
        FROM lexemes l ${whereSql}`;
    const orderBy = {
      lapses: "lapses DESC, l.created_at DESC",
      encounters: "encounters DESC, l.created_at DESC",
      level: "frq_tag_rank DESC, lapses DESC, l.created_at DESC",
      created: "l.created_at DESC",
    }[params.sort] || "l.created_at DESC";
    let sql = aggSql;
    if (params.sort === "level") {
      // 等级排序用阶梯序号（SQL 里没有该映射，用 CASE）
      const cases = LEVEL_LADDER.map((t, i) => `WHEN ' '||l.tag||' ' LIKE '% ${t} %' THEN ${i}`).join(" ");
      sql = aggSql.replace("SELECT l.id,", `SELECT l.id, CASE ${cases} ELSE -1 END AS frq_tag_rank,`);
    }
    const rows = this.user
      .prepare(`${sql} ORDER BY ${orderBy} LIMIT ${LEXEME_PAGE} OFFSET ${off}`)
      .all(now, ...args)
      .map((r) => ({ ...r, level: levelOfTag(r.tag) }));
    return { total, offset: off, rows };
  }

  // 例句译文：仅内置素材有句对；用户导入/粘贴的文章离线无译文，返回 null
  sentenceZh(textId, sentence) {
    if (textId == null || !sentence) return null;
    const t = this.user.prepare("SELECT raw_text FROM texts WHERE id=?").get(textId);
    if (!t) return null;
    const b = this.builtins.find((x) => jsNorm(x.text) === jsNorm(t.raw_text));
    if (!b || !Array.isArray(b.paras)) return null;
    const normS = jsNorm(sentence);
    for (const para of b.paras) {
      for (const [en, zh] of para.pairs || []) {
        const ne = jsNorm(en);
        if (ne === normS || ne.includes(normS) || normS.includes(ne)) return zh;
      }
    }
    return null;
  }

  lexemeDetail(id) {
    const l = this.user
      .prepare("SELECT id, lemma, sense, tag, created_at FROM lexemes WHERE id=?")
      .get(id);
    if (!l) return null;
    const notes = this.user
      .prepare(`SELECT n.id, n.context_sentence, n.text_id, n.source, t.title AS text_title
        FROM notes n LEFT JOIN texts t ON t.id=n.text_id
        WHERE n.lexeme_id=? ORDER BY n.id`)
      .all(id)
      .map((n) => ({
        ...n,
        zh: this.sentenceZh(n.text_id, n.context_sentence),
        source: n.source || (n.text_id == null ? "syllabus" : "reading"),
        cards: this.user
          .prepare("SELECT id, card_type, due, state, lapses FROM cards WHERE note_id=? ORDER BY id")
          .all(n.id),
      }));
    const lapses = this.user
      .prepare("SELECT COALESCE(SUM(c.lapses),0) n FROM cards c JOIN notes n ON n.id=c.note_id WHERE n.lexeme_id=?")
      .get(id).n;
    const encounters = this.user
      .prepare("SELECT COUNT(DISTINCT source_ref) n FROM evidence_log WHERE lexeme_id=? AND source_type IN ('reader','resurface') AND source_ref<>''")
      .get(id).n;
    return {
      ...l, level: levelOfTag(l.tag), lapses, encounters,
      related: this.relatedWords(l.lemma), notes,
    };
  }

  // 同根词（词典同前缀族，带释义）+ 近义词（中文释义反查）

﻿  // 同根/派生词：AWL 权威词族 → ECDICT exchange 屈折（白名单码）→ POS 感知的显式形态规则派生
  relatedWords(lemma) {
    const low = String(lemma || "").toLowerCase();
    const map = new Map();
    const pushWord = (wIn, opts = {}) => {
      const w = String(wIn || "").toLowerCase().trim();
      if (!w || w === low || map.has(w) || w.includes("-")) return;
      const r = this.user.prepare("SELECT word,pos,translation,frq,tag,exchange FROM dict.words WHERE word=?").get(w);
      if (!r) return;
      // exchange 屈折来源门控：常用词直接收；零频候选必须在自身 exchange 里声明 0:<本词>
      // （started/became/happier 保留；partied/birded/frenches/lowing 这类空声明零频动词化剔除）
      if (opts.inflection) {
        const declares = (r.exchange || "").match(/(?:^|\/)0:([^/]+)/);
        const common = Number(r.frq) > 0 || (r.tag || "");
        if (!common && !(declares && declares[1].toLowerCase() === low)) return;
      }
      const gloss = ((r.pos ? r.pos + " " : "") + (r.translation.split("\\n")[0] || ""))
        .replace(/\[[^\]]*\]/g, "").trim().slice(0, 40);
      if (gloss) map.set(w, { word: w, gloss });
    };
    // 1) AWL 词族（头词+全部成员）
    const fam = AWL_BY_FORM.get(low);
    if (fam) for (const f of [fam.h, ...fam.f]) pushWord(f);
    // 2) ECDICT exchange：仅接受屈折码 p/d/i/3/s/r/t（忽略 0 原形与脏数据码 1）
    const EXCHANGE_CODES = new Set(["p", "d", "i", "3", "s", "r", "t"]);
    const self = this.user.prepare("SELECT exchange FROM dict.words WHERE word=?").get(low);
    if (self && self.exchange && !this.isFunctionLemma(low)) {
      for (const item of self.exchange.split("/")) {
        if (!item.includes(":")) continue;
        const [code, v] = item.split(":", 2);
        if (!EXCHANGE_CODES.has(code) || !v) continue;
        v.split(",").forEach((x) => pushWord(x, { inflection: true }));
      }
    }
    // 3) 派生词：POS 感知的显式形态规则（直接加缀 / 去 e / y→i / 双写尾辅音）
    const glossPos = () => {
      const r = this.user.prepare("SELECT translation FROM dict.words WHERE word=?").get(low);
      const mm = r && /^\s*([a-z]{1,6})\./i.exec(r.translation.split("\\n")[0] || "");
      return mm ? mm[1].toLowerCase() : "";
    };
    const pos = glossPos();
    const posGroup = /^(v|vi|vt|aux)$/.test(pos) ? "v"
      : pos === "n" ? "n"
      : /^(a|adj)$/.test(pos) ? "a"
      : pos === "adv" ? "adv" : "";
    const FUNCTION_POS = /^(art|prep|conj|pron|det|int|interj|num|modal|aux|part|abbr)$/;
    if (low.length >= 4 && !FUNCTION_POS.test(pos)) {
      const TAILS_BY_GROUP = {
        v: ["s", "es", "ed", "d", "ing", "er", "ers", "est", "ly", "ally", "ively", "ment", "ments",
          "ness", "ity", "ive", "al", "or", "ors", "ion", "ions", "tion", "tions", "able", "ible", "ic", "ical", "istic", "ous"],
        n: ["s", "es", "ly", "ment", "ments", "ness", "ity", "ties", "al", "ic", "ical", "istic", "ous", "ion", "tions", "ive"],
        a: ["er", "ers", "est", "ly", "ally", "ively", "ness", "ity", "ties", "ive", "al", "ic", "ical", "istic", "able", "ible", "ous"],
        adv: ["er", "est", "ly", "ally", "ively"],
        "": ["s", "es", "ed", "d", "ing", "er", "ers", "est", "ly", "ally", "ment", "ness", "ity",
          "ive", "al", "or", "ors", "ion", "tion", "able", "ible", "ic", "ical", "istic", "ous"],
      };
      const tails = TAILS_BY_GROUP[posGroup] || TAILS_BY_GROUP[""];
      const accept = new Set();
      for (const t of tails) accept.add(low + t);
      if (low.endsWith("e")) {
        const stem = low.slice(0, -1);
        for (const t of tails) accept.add(stem + t);
      }
      if (low.endsWith("y")) {
        const stem = low.slice(0, -1) + "i";
        for (const t of tails) accept.add(stem + t);
      }
      for (const t of ["ed", "ing", "er", "est"]) accept.add(low + low.slice(-1) + t);
      // 三种前缀：原词、去 e 词干（activation）、y→i 词干（happiness）
      const prefixes = [low];
      if (low.endsWith("e")) prefixes.push(low.slice(0, -1));
      if (low.endsWith("y")) prefixes.push(low.slice(0, -1) + "i");
      const rows = [];
      const seenW = new Set();
      for (const pfx of prefixes) {
        for (const r of this.user
          .prepare("SELECT word,pos,translation,frq,tag FROM dict.words WHERE word LIKE ? AND word<>? AND length(word)<=length(?)+8 ORDER BY frq DESC LIMIT 120")
          .all(pfx + "%", low, low)) {
          if (!seenW.has(r.word)) { seenW.add(r.word); rows.push(r); }
        }
      }
      for (const r of rows) {
        const w = r.word.toLowerCase();
        if (w.includes("-") || !accept.has(w) || !(Number(r.frq) > 0 || (r.tag || ""))) continue;
        const gloss = ((r.pos ? r.pos + " " : "") + (r.translation.split("\\n")[0] || ""))
          .replace(/\[[^\]]*\]/g, "").trim().slice(0, 40);
        if (gloss) map.set(w, { word: w, gloss });
      }
    }
    const family = [...map.values()].slice(0, 10);
    // 近义词：同词性、频率带接近、中文释义匹配、排除否定释义与形态相近词（形态归同根）
    let synonyms = [];
    const row = this.user.prepare("SELECT translation, frq FROM dict.words WHERE word=?").get(low);
    if (row && row.translation) {
      const first = row.translation.split("\\n")[0];
      const posMm = first.match(/^\s*([a-z]{1,6})\./i);
      const posPrefix = posMm ? posMm[1] + "." : "";
      const runs = (first.match(/[一-鿿]{2,6}/g) || []);
      let headRun = "";
      for (const rr of runs) { if (rr.length > headRun.length) headRun = rr; if (headRun.length >= 6) break; }
      const rank = row.frq > 0 ? Number(row.frq) : 0;
      if (headRun) {
        const samePrefix = (w) => low.length >= 5
          ? w.slice(0, 4) === low.slice(0, 4)
          : w.slice(0, 3) === low.slice(0, 3);
        let q = "SELECT word, translation FROM dict.words WHERE translation LIKE ? AND word<>? AND length(word)<=14 AND frq>0";
        const args = ["%" + headRun + "%", low];
        if (posPrefix) { q += " AND translation LIKE ?"; args.push(posPrefix + "%"); }
        if (rank > 0) { q += " AND frq BETWEEN ? AND ?"; args.push(Math.max(1, Math.round(rank / 3)), Math.round(rank * 3)); }
        q += " ORDER BY frq DESC LIMIT 40";
        synonyms = this.user.prepare(q).all(...args)
          .map((r2) => ({
            word: r2.word,
            gloss: (r2.translation.split("\\n")[0] || "").replace(/\[[^\]]*\]/g, "").slice(0, 36),
            firstLine: r2.translation.split("\\n")[0] || "",
          }))
          .filter((s) => {
            if (!s.gloss || s.word.includes("-") || samePrefix(s.word.toLowerCase())) return false;
            const neg = /[不没无非反]/.test(s.gloss) && !/[不没无非反]/.test(first);
            if (neg) return false;
            // 义项段（逗号/顿号/分号切分）中必须有与 head 相等或仅差 1 字的段，拒绝“战争状态”式子串碰撞
            const segs = s.firstLine.replace(/^\s*[a-z]{1,6}\./i, "").split(/[，,、；;]/).map((x) => x.trim()).filter(Boolean);
            return segs.some((seg) => seg === headRun || (headRun.length >= 4 && seg.length <= headRun.length + 1 && seg.includes(headRun)));
          })
          .map(({ word, gloss }) => ({ word, gloss }))
          .slice(0, 6);
      }
    }
    return { family, synonyms };
  }

  answer({ cardId, rating, elapsedMs }) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 4) throw new Error("rating 必须为 1-4");
    const now = nowMs();
    const c = this.user
      .prepare("SELECT state, stability, difficulty, reps, lapses, last_review, note_id, asset_id, card_type FROM cards WHERE id=?")
      .get(cardId);
    if (!c) throw new Error("card not found");
    const card = c.stability != null
      ? {
          due: new Date(c.due), stability: c.stability, difficulty: c.difficulty,
          elapsed_days: 0, scheduled_days: 0, reps: c.reps, lapses: c.lapses,
          state: c.state, last_review: c.last_review != null ? new Date(c.last_review) : undefined,
        }
      : createEmptyCard(new Date(now));
    const rec = this.fsrsEngine.repeat(card, new Date(now));
    const picked = rec[rating] ?? rec[Rating.Good];
    const nc = picked.card;
    const due = Math.max(now + 60_000, nc.due.getTime());
    const intervalDays = nc.scheduled_days;
    const lapsesInc = rating === 1 ? 1 : 0;

    // FSRS 推进 + 复习日志 + 证据同一事务：卡排期成功而日志/证据失败会永久错乱新卡配额与仪表盘统计
    this.user.exec("BEGIN");
    try {
      this.user
        .prepare("UPDATE cards SET due=?, state=?, stability=?, difficulty=?, reps=reps+1, lapses=lapses+?, last_review=? WHERE id=?")
        .run(due, nc.state, nc.stability, nc.difficulty, lapsesInc, now, cardId);
      const lastIvl = c.last_review ? Math.max(0, Math.floor((now - c.last_review) / DAY_MS)) : 0;
      this.user
        .prepare("INSERT INTO review_log(card_id,rated_at,rating,last_ivl,ivl,elapsed_ms) VALUES(?,?,?,?,?,?)")
        .run(cardId, now, rating, lastIvl, Math.round(intervalDays), elapsedMs || 0);

      // 证据维度按卡型分流（方案 §7.3）：听音卡=listening_recognition，释义回想卡=meaning_recall，其余=reading
      const DIM_BY_TYPE = { l_recog: "listening_recognition", recall: "meaning_recall", spelling: "spelling", r_recog: "reading_recognition", cloze: "reading_recognition", concept: "reading_recognition" };
      const dim = DIM_BY_TYPE[c.card_type] || "reading_recognition";
      if (c.note_id != null) {
        const note = this.user.prepare("SELECT lexeme_id FROM notes WHERE id=?").get(c.note_id);
        if (note) {
          this.user
            .prepare("INSERT INTO evidence_log(lexeme_id,dimension,result,source_type,source_ref,card_id,created_at) VALUES(?,?,?,'review','',?,?)")
            .run(note.lexeme_id, dim, rating === 1 ? "lapse" : "ok", cardId, now);
        }
      } else {
        // 资产卡（chunk/grammar/pron/concept）：无词元，证据进 asset_evidence（source_kind='review'）
        const a = this.user.prepare("SELECT asset_kind FROM learning_assets WHERE id=?").get(c.asset_id);
        this._revSeq = (this._revSeq || 0) + 1;
        this.addAssetEvidence({
          asset_id: c.asset_id,
          dimension: (a ? a.asset_kind : "asset") + "_review",
          result: rating === 1 ? "wrong" : rating === 2 ? "partial" : "correct",
          source_kind: "review",
          source_ref: "card:" + cardId,
          payload: { rating, card_type: c.card_type },
          idempotency_key: "rev-" + cardId + "-" + now + "-" + this._revSeq,
        });
      }
      this.user.exec("COMMIT");
    } catch (e) {
      try { this.user.exec("ROLLBACK"); } catch { /* 已回滚则忽略 */ }
      throw e;
    }

    return { due_ms: due, interval_days: intervalDays, stability: nc.stability, difficulty: nc.difficulty, lapses: c.lapses + lapsesInc };
  }

  counts() {
    const now = nowMs();
    const todayStart = this.dayStart(now);
    const dueReview = this.user
      .prepare("SELECT COUNT(*) AS n FROM cards WHERE state!=0 AND due<=?").get(now).n;
    const newToday = this.user
      .prepare(`SELECT COUNT(*) AS n FROM cards c WHERE c.state!=0 AND EXISTS(
        SELECT 1 FROM review_log rl WHERE rl.card_id=c.id AND rl.rated_at>=?
        AND rl.id=(SELECT MIN(id) FROM review_log WHERE card_id=c.id))`)
      .get(todayStart).n;
    const totalCards = this.user.prepare("SELECT COUNT(*) AS n FROM cards").get().n;
    const totalLexemes = this.user.prepare("SELECT COUNT(*) AS n FROM lexemes WHERE pos <> '__concept__'").get().n;
    return { due_review: dueReview, new_remaining_today: Math.max(0, NEW_PER_DAY - newToday), total_cards: totalCards, total_lexemes: totalLexemes };
  }

  // S9-3 今日页：固定调度 ①有到期/新卡→复习 ②无卡且有未读完文章→继续精读 ③都没有→今日好文
  // 每张卡预估 30 秒（认读为主），最少 1 分钟
  todayBrief() {
    const c = this.counts();
    // 新卡实际可学数 = min(今日新卡余额, 库中 state=0 新卡总数)，空库不算队列
    const freshCards = this.user.prepare("SELECT COUNT(*) AS n FROM cards WHERE state=0").get().n;
    const fresh = Math.min(c.new_remaining_today, freshCards);
    const queue = c.due_review + fresh;
    const estMinutes = queue > 0 ? Math.max(1, Math.round(queue * 0.5)) : 0;
    let resume = null;
    const row = this.user.prepare("SELECT ref_id, locator_json FROM resume_state WHERE scope='reading'").get();
    if (row) {
      const t = this.user.prepare("SELECT title FROM texts WHERE id=?").get(Number(row.ref_id));
      if (t) {
        const loc = JSON.parse(this._sessionLocator(row.locator_json));
        resume = { refId: row.ref_id, title: t.title, pi: loc.pi, ch: loc.ch ?? 0 };
      }
    }
    const wrongDue = this.wrongDueCount();
    const recycle = this.recycleCount();
    let primary = "feed";
    if (queue > 0) primary = "review";
    else if (resume) primary = "reading";
    return {
      primary,
      due_cards: c.due_review,
      fresh_today: fresh,
      queue,
      est_minutes: estMinutes,
      resume,
      wrong_due: wrongDue,
      recycle_multi: recycle.multi,
      recycle_total: recycle.total,
      shadow_due: this.shadowDueCount(),
    };
  }


  // —— S10-1 仪表盘聚合（只读；四互斥主流分钟 + 动作次数，绝不互相折算）——
  // 有效学习日：复习≥10 卡 / read amount≥300词且 active≥3min / shadow≥3句 / 完成1套卷
  _validDay(a) {
    return a.reviews >= 10
      || (a.readWords >= 300 && a.readMs >= 3 * 60_000)
      || a.shadowSentences >= 3
      || a.examPapers >= 1;
  }

  // 聚合 [fromTs, toTs) 内全部事实，返回 Map<dayKey, agg>
  _aggregateDaily(fromTs, toTs = Date.now() + DAY_MS) {
    const map = new Map();
    const ensure = (ts) => {
      const key = this.dayKey(ts);
      let a = map.get(key);
      if (!a) {
        a = { key, readMs: 0, shadowMs: 0, reviewMs: 0, examMs: 0, reviews: 0,
          readWords: 0, shadowSentences: 0, examPapers: 0, lookup: 0, note: 0, translation: 0 };
        map.set(key, a);
      }
      return a;
    };
    for (const r of this.user
      .prepare("SELECT kind,started_at,active_ms,amount,unit FROM learning_sessions WHERE started_at>=? AND started_at<? AND status!='open'")
      .all(fromTs, toTs)) {
      const a = ensure(r.started_at);
      if (r.kind === "read") { a.readMs += r.active_ms || 0; if (r.unit === "words") a.readWords += r.amount; }
      else { a.shadowMs += r.active_ms || 0; if (r.unit === "sentences") a.shadowSentences += r.amount; }
    }
    for (const r of this.user.prepare("SELECT rated_at, elapsed_ms FROM review_log WHERE rated_at>=? AND rated_at<?").all(fromTs, toTs)) {
      const a = ensure(r.rated_at); a.reviews++; a.reviewMs += r.elapsed_ms || 0;
    }
    for (const r of this.user.prepare("SELECT started_at, active_ms FROM attempts WHERE started_at>=? AND started_at<?").all(fromTs, toTs)) {
      const a = ensure(r.started_at); a.examPapers++; a.examMs += r.active_ms || 0; // active_ms=0 不计分钟
    }
    const countInto = (sql, f, t, field) => {
      for (const r of this.user.prepare(sql).all(f, t)) ensure(r.ts)[field]++;
    };
    countInto("SELECT created_at AS ts FROM lookup_log WHERE created_at>=? AND created_at<?", fromTs, toTs, "lookup");
    countInto("SELECT created_at AS ts FROM notes WHERE created_at>=? AND created_at<?", fromTs, toTs, "note");
    countInto("SELECT updated_at AS ts FROM text_translations WHERE updated_at>=? AND updated_at<? AND status='ok'", fromTs, toTs, "translation");
    return map;
  }

  _streak(aggMap) {
    const validKeys = new Set();
    for (const [k, a] of aggMap) if (this._validDay(a)) validKeys.add(k);
    // longest：按日历日相邻计数
    const keys = [...validKeys].sort();
    let longest = 0, run = 0, prev = null;
    for (const k of keys) {
      const t = new Date(k + "T00:00:00").getTime();
      if (prev !== null && t - prev === DAY_MS) run++; else run = 1;
      if (run > longest) longest = run;
      prev = t;
    }
    // current：今天有效从今天起，否则从昨天起；向前走到断签
    let cur = 0;
    let cursor = this.dayStart();
    if (!validKeys.has(this.dayKey(cursor))) cursor -= DAY_MS;
    while (validKeys.has(this.dayKey(cursor))) { cur++; cursor -= DAY_MS; }
    return { current: cur, longest };
  }

  insights(rangeDays = 30) {
    const n = Math.min(365, Math.max(7, Math.floor(Number(rangeDays) || 30)));
    const todayStart = this.dayStart();
    const start = todayStart - (n - 1) * DAY_MS;
    const rangeMap = this._aggregateDaily(start, todayStart + DAY_MS);
    const days = [];
    const totals = { readMs: 0, shadowMs: 0, reviewMs: 0, examMs: 0, reviews: 0, readWords: 0,
      shadowSentences: 0, examPapers: 0, lookup: 0, note: 0, translation: 0 };
    for (let i = 0; i < n; i++) {
      const ts = start + i * DAY_MS;
      const key = this.dayKey(ts);
      const a = rangeMap.get(key) || { readMs: 0, shadowMs: 0, reviewMs: 0, examMs: 0, reviews: 0,
        readWords: 0, shadowSentences: 0, examPapers: 0, lookup: 0, note: 0, translation: 0 };
      for (const k of Object.keys(totals)) totals[k] += a[k] || 0;
      const d = new Date(ts);
      days.push({
        key, label: `${d.getMonth() + 1}/${d.getDate()}`,
        minutes: {
          read: Math.round(a.readMs / 60_000), shadow: Math.round(a.shadowMs / 60_000),
          review: Math.round(a.reviewMs / 60_000), exam: Math.round(a.examMs / 60_000),
        },
        counts: { lookup: a.lookup, note: a.note, translation: a.translation },
        reviews: a.reviews, readWords: a.readWords, shadowSentences: a.shadowSentences,
        examPapers: a.examPapers, valid: this._validDay(a),
      });
    }
    const allMap = this._aggregateDaily(0, todayStart + DAY_MS);
    const coverage = this.user.prepare(`SELECT c.created_at AS ts, c.kind, c.cefr, c.rate,
        c.total_tokens AS total, c.known_tokens AS known, c.text_id AS textId, t.title
      FROM coverage_assessments c LEFT JOIN texts t ON t.id=c.text_id
      ORDER BY c.created_at`).all()
      .map((r) => ({
        key: this.dayKey(r.ts), kind: r.kind, cefr: r.cefr, rate: r.rate, total: r.total, known: r.known,
        textId: r.textId, title: r.title ?? null, deleted: r.textId != null && r.title == null,
      }));
    return {
      range_days: n,
      days,
      totals: {
        minutes: {
          read: Math.round(totals.readMs / 60_000), shadow: Math.round(totals.shadowMs / 60_000),
          review: Math.round(totals.reviewMs / 60_000), exam: Math.round(totals.examMs / 60_000),
        },
        counts: { lookup: totals.lookup, note: totals.note, translation: totals.translation },
        reviews: totals.reviews, readWords: totals.readWords, shadowSentences: totals.shadowSentences, examPapers: totals.examPapers,
      },
      streak: this._streak(allMap),
      coverage,
      history_note: "阅读/跟读完整记录自 v2.16（migration v11）起",
    };
  }

  // 某日下钻：会话/套卷逐条（带墓碑），复习/查词/成卡/翻译为汇总条
  dayTimeline(dateKey) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
    if (!m) throw new Error("dateKey 必须是 YYYY-MM-DD");
    const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    const end = start + DAY_MS;
    const textExists = new Set(this.user.prepare("SELECT id FROM texts").all().map((r) => r.id));
    const entries = [];
    for (const r of this.user.prepare(`SELECT id, kind, started_at AS ts, ref_type AS refType, ref_id AS refId,
        title_snapshot AS title, amount, unit, active_ms AS ms, status
      FROM learning_sessions WHERE started_at>=? AND started_at<? ORDER BY started_at`).all(start, end)) {
      const deleted = r.refType === "text" && !textExists.has(Number(r.refId));
      entries.push({
        kind: r.kind, ts: r.ts, title: r.title || (deleted ? "已删除文章" : ""),
        refType: r.refType, refId: r.refId, deleted,
        amount: r.amount, unit: r.unit, minutes: Math.round((r.ms || 0) / 60_000), status: r.status,
      });
    }
    for (const r of this.user.prepare(`SELECT a.id, a.started_at AS ts, a.active_ms AS ms, p.title
      FROM attempts a LEFT JOIN papers p ON p.id=a.paper_id
      WHERE a.started_at>=? AND a.started_at<? ORDER BY a.started_at`).all(start, end)) {
      entries.push({ kind: "exam", ts: r.ts, title: r.title || "试卷", amount: 1, unit: "papers",
        minutes: Math.round((r.ms || 0) / 60_000), deleted: r.title == null });
    }
    const a = this._aggregateDaily(start, end).get(dateKey);
    if (a) {
      if (a.reviews) entries.push({ kind: "review", amount: a.reviews, unit: "cards", minutes: Math.round(a.reviewMs / 60_000) });
      if (a.lookup) entries.push({ kind: "lookup", amount: a.lookup, unit: "times" });
      if (a.note) entries.push({ kind: "note", amount: a.note, unit: "cards" });
      if (a.translation) entries.push({ kind: "translation", amount: a.translation, unit: "paragraphs" });
    }
    entries.sort((x, y) => (y.ts || 0) - (x.ts || 0));
    return { key: dateKey, valid: a ? this._validDay(a) : false, entries };
  }

  // ============ V3 考试模式 ============
  importPaper(md, audioPaths = []) {
    const parsed = parsePaper(md);
    if (parsed.errors.length) throw new Error("试卷解析失败：" + parsed.errors.join("；"));
    const norm = jsNorm(md);
    const dup = this.user.prepare("SELECT id, audio FROM papers WHERE norm_text=?").get(norm);
    if (dup) return { id: dup.id, duplicated: true, title: parsed.title, nQuestions: parsed.questions.length, audio: dup.audio };
    const now = nowMs();
    this.user.prepare(`INSERT INTO papers(title, kind, raw_md, norm_text, struct_json, n_questions, audio, created_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(parsed.title, parsed.kind, md, norm, JSON.stringify(parsed), parsed.questions.length, "", now);
    const id = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
    // 复制本地音频到 data/media（只保留文件名，试卷 section 用 ::audio 文件名.mp3 引用）
    const mediaDir = path.join(this.dataDir, "media");
    let firstAudio = "";
    const copied = [];
    for (const src of audioPaths || []) {
      try {
        if (!src || !fs.existsSync(src)) continue;
        fs.mkdirSync(mediaDir, { recursive: true });
        const name = `p${id}-${path.basename(src).replace(/[^\w.\-]+/g, "_")}`;
        fs.copyFileSync(src, path.join(mediaDir, name));
        copied.push(name);
        if (!firstAudio) firstAudio = name;
      } catch (e) {
        console.error("[media] 音频复制失败（不阻断导入）:", src, e.message);
      }
    }
    if (firstAudio) this.user.prepare("UPDATE papers SET audio=? WHERE id=?").run(firstAudio, id);
    return { id, duplicated: false, title: parsed.title, nQuestions: parsed.questions.length, audio: firstAudio, copied };
  }

  mediaPath(name) {
    const safe = String(name || "").replace(/[^\w.\-]+/g, "_");
    const f = path.join(this.dataDir, "media", safe);
    return fs.existsSync(f) ? f : null;
  }

  listPapers() {
    return this.user.prepare(`SELECT p.id, p.title, p.kind, p.n_questions, p.created_at,
      (SELECT MAX(finished_at) FROM attempts a WHERE a.paper_id=p.id) AS last_attempt,
      (SELECT COUNT(*) FROM wrong_questions w WHERE w.paper_id=p.id AND w.state='active') AS active_wrong
      FROM papers p ORDER BY p.id DESC`).all();
  }

  getPaper(id) {
    const r = this.user.prepare("SELECT * FROM papers WHERE id=?").get(id);
    if (!r) return null;
    // struct_json 列没有 json_valid CHECK（建表时即如此），坏件会让整套试卷/错题本页面抛错；
    // 这里降级成空结构，宁可少题也不炸列表
    let struct = { questions: [], sections: [] };
    try {
      const s = JSON.parse(r.struct_json);
      if (s && typeof s === "object") {
        struct = {
          ...s,
          questions: Array.isArray(s.questions) ? s.questions : [],
          sections: Array.isArray(s.sections) ? s.sections : [],
        };
      }
    } catch { /* 保留空结构 */ }
    return { id: r.id, title: r.title, kind: r.kind, raw_md: r.raw_md, n_questions: r.n_questions,
      audio: r.audio || "", struct, created_at: r.created_at };
  }

  // 交卷判分：客观题离线比对（错题自动入错题本 stage0=1 天后重做）；主观题（写作/翻译）只留存不评分
  gradeAttempt(paperId, answers, startedAt) {
    const p = this.getPaper(paperId);
    if (!p) throw new Error("paper not found");
    const now = nowMs();
    const details = p.struct.questions.map((q) => {
      const picked = String(answers[q.index] ?? "");
      const graded = q.qtype === "objective";
      return {
        index: q.index, picked, qtype: q.qtype, section: q.section,
        graded, correct: graded ? picked.toUpperCase() === q.answer : null, answer: q.answer,
        model: q.model || "",
      };
    });
    const obj = details.filter((d) => d.graded);
    const correct = obj.filter((d) => d.correct).length;
    const result = { correct, total: obj.length, total_all: details.length, details };
    this.user.prepare("INSERT INTO attempts(paper_id, answers_json, result_json, started_at, finished_at) VALUES(?,?,?,?,?)")
      .run(paperId, JSON.stringify(answers || {}), JSON.stringify(result), startedAt || now, now);
    const upsert = this.user.prepare(`INSERT INTO wrong_questions(paper_id, q_index, picked, state, stage, next_review, redos, created_at)
      VALUES(?,?,?,'active',0,?,0,?)
      ON CONFLICT(paper_id, q_index) DO UPDATE SET picked=excluded.picked, state='active', stage=0, next_review=excluded.next_review`);
    for (const d of details) {
      if (d.graded && !d.correct) upsert.run(paperId, d.index, d.picked, now + DAY_MS, now);
    }
    return result;
  }

  // 错题本：state=active/archived/all；联表带出题目内容与到期标记
  // S13-d-2 考后薄弱清单：active 错题，带题干/题型，供今日页与对话演练
  examWeakList({ limit = 3 } = {}) {
    const n = Math.max(1, Math.min(20, Number(limit) || 3));
    const rows = this.user.prepare(
      `SELECT wq.id, wq.paper_id, wq.q_index, wq.reason, wq.next_review,
              p.title AS paper_title, p.struct_json
         FROM wrong_questions wq
         JOIN papers p ON p.id=wq.paper_id
        WHERE wq.state='active'
        ORDER BY wq.next_review DESC, wq.id DESC LIMIT ?`).all(n);
    return rows.map((r) => {
      let stem = "", sectionKind = "", answer = "", point = "";
      try {
        const st = JSON.parse(r.struct_json);
        const sections = Array.isArray(st) ? st : (st.sections || []);
        outer: for (const sec of sections) {
          for (const q0 of sec.questions || []) {
            if (q0.index === r.q_index) {
              stem = q0.stem || "";
              sectionKind = q0.section_kind || sec.kind || "";
              answer = q0.answer || "";
              point = q0.point || "";
              break outer;
            }
          }
        }
      } catch {}
      const k = String(sectionKind).toLowerCase();
      return {
        id: r.id,
        paper_id: r.paper_id,
        q_index: r.q_index,
        paper_title: r.paper_title,
        reason: r.reason,
        stem,
        section_kind: k,
        answer,
        point,
        is_listening: k.includes("listen"),
      };
    });
  }

  listWrong(state = "active") {
    const where = state === "all" ? "" : "WHERE w.state=?";
    const rows = this.user.prepare(`SELECT w.*, p.title AS paper_title FROM wrong_questions w
      JOIN papers p ON p.id=w.paper_id ${where} ORDER BY w.next_review`).all(...(state === "all" ? [] : [state]));
    const now = nowMs();
    return rows.map((r) => {
      const p = this.getPaper(r.paper_id);
      const q = p?.struct.questions.find((x) => x.index === r.q_index) || null;
      return { ...r, due: r.state === "active" && r.next_review <= now, stage_label: ["1 天后", "3 天后", "7 天后", "已归档"][r.stage] || "", question: q };
    });
  }

  wrongDueCount() {
    return this.user.prepare("SELECT COUNT(*) n FROM wrong_questions WHERE state='active' AND next_review<=?").get(nowMs()).n;
  }

  // 标注错因并生成概念卡（FSRS）；幂等：已有概念卡只更新错因
  setWrongReason(id, reason) {
    const w = this.user.prepare("SELECT * FROM wrong_questions WHERE id=?").get(id);
    if (!w) throw new Error("wrong question not found");
    this.user.prepare("UPDATE wrong_questions SET reason=? WHERE id=?").run(reason, id);
    const p = this.getPaper(w.paper_id);
    const q = p?.struct.questions.find((x) => x.index === w.q_index);
    if (!q) return { concept_card_id: w.concept_card_id };
    const lemma = `§${w.paper_id}-${w.q_index}`;
    const front = `【${reason || "未分类"}】${q.stem.slice(0, 60)}`;
    const back = [`题干：${q.stem}`, q.point ? `考点：${q.point}` : "", `解析：${q.analysis || "（无解析）"}`, `正确答案：${q.answer}`].filter(Boolean).join("\n");
    if (w.concept_card_id) {
      this.user.prepare("UPDATE lexemes SET sense=? WHERE lemma=? AND pos='__concept__'").run(front, lemma);
      this.user.prepare(`UPDATE notes SET context_sentence=? WHERE id=(SELECT note_id FROM cards WHERE id=?)`)
        .run(back, w.concept_card_id);
      return { concept_card_id: w.concept_card_id };
    }
    const now = nowMs();
    const tx = this.user.prepare("BEGIN IMMEDIATE");
    try {
      tx.run();
      this.user.prepare(`INSERT INTO lexemes(lemma, pos, sense, tag, bnc, frq, created_at) VALUES(?,?,?,'',0,0,?)`)
        .run(lemma, "__concept__", front, now);
      const lexId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
      this.user.prepare("INSERT INTO notes(lexeme_id, text_id, context_sentence, source, created_at) VALUES(?,NULL,?,'concept',?)")
        .run(lexId, back, now);
      const noteId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
      this.user.prepare(`INSERT INTO cards(note_id, card_type, due, state, stability, difficulty, reps, lapses, last_review, created_at)
        VALUES(?,'concept',?,0,NULL,NULL,0,0,NULL,?)`).run(noteId, now + 60_000, now);
      const cardId = Number(this.user.prepare("SELECT last_insert_rowid() AS id").get().id);
      this.user.prepare("UPDATE wrong_questions SET concept_card_id=? WHERE id=?").run(cardId, id);
      this.user.prepare("COMMIT").run();
      return { concept_card_id: cardId };
    } catch (e) {
      try { this.user.prepare("ROLLBACK").run(); } catch { /* 已回滚 */ }
      throw e;
    }
  }

  // 错题重做：对→推进 1/3/7 阶段（第 3 次通过归档）；错→回到 stage0
  redoWrong(id, picked) {
    const w = this.user.prepare("SELECT * FROM wrong_questions WHERE id=?").get(id);
    if (!w) throw new Error("wrong question not found");
    const p = this.getPaper(w.paper_id);
    const q = p?.struct.questions.find((x) => x.index === w.q_index);
    const ok = !!q && picked.toUpperCase() === q.answer;
    const now = nowMs();
    const GAPS = [1, 3, 7];
    let stage = w.stage, state = w.state, nextReview = w.next_review;
    if (ok) {
      if (w.stage >= 2) { stage = 3; state = "archived"; nextReview = now; }
      else { stage = w.stage + 1; nextReview = now + GAPS[stage] * DAY_MS; }
    } else {
      stage = 0; nextReview = now + DAY_MS;
    }
    this.user.prepare("UPDATE wrong_questions SET stage=?, state=?, next_review=?, redos=redos+1 WHERE id=?")
      .run(stage, state, nextReview, id);
    return { correct: ok, stage, state, next_review: nextReview,
      stage_label: ok ? (state === "archived" ? "已通过归档" : `${GAPS[stage - 1] || 7} 天后再做`) : "1 天后重做" };
  }

  archiveWrong(id) {
    this.user.prepare("UPDATE wrong_questions SET state='archived', stage=3 WHERE id=?").run(id);
  }

  // S6：书库卡片数据——分页/排序/来源与难度筛选，带来源、统计、查词数
  // opts: { limit=50, offset=0, sort='recent'|'words'|'cefr'|'rate'|'lookups', kind, cefr, q }
  listTexts(opts = {}) {
    const limit = Math.max(1, Math.min(500, Number(opts.limit) || 50));
    const offset = pageOffset(opts.offset);
    const where = [];
    const params = [];
    if (opts.kind) {
      where.push("EXISTS (SELECT 1 FROM text_sources s WHERE s.text_id=t.id AND s.kind=?)");
      params.push(opts.kind);
    }
    if (opts.cefr) {
      where.push("json_extract(t.stats_json,'$.cefr')=?");
      params.push(opts.cefr);
    }
    if (opts.q) {
      where.push("t.title LIKE ?");
      params.push(`%${String(opts.q).slice(0, 100)}%`);
    }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    const orderBy = {
      recent: "t.id DESC",
      words: "json_extract(t.stats_json,'$.words') DESC, t.id DESC",
      cefr: "json_extract(t.stats_json,'$.cefr') ASC, t.id DESC",
      rate: "json_extract(t.stats_json,'$.rate') ASC, t.id DESC",
      lookups: "lookups DESC, t.id DESC",
    }[opts.sort] || "t.id DESC";
    const total = this.user.prepare(`SELECT COUNT(*) n FROM texts t ${whereSql}`).get(...params).n;
    const totalAll = this.user.prepare("SELECT COUNT(*) n FROM texts").get().n;
    const rows = this.user
      .prepare(`SELECT t.id, t.title, t.created_at, t.stats_json,
        (SELECT COUNT(*) FROM lookup_log l WHERE l.text_id=t.id) AS lookups
        FROM texts t ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    const srcStmt = this.user.prepare(
      "SELECT kind,label,uri,external_ref AS externalRef,imported_at AS importedAt FROM text_sources WHERE text_id=? ORDER BY imported_at"
    );
    const items = rows.map((r) => {
      let stats = null;
      try { stats = r.stats_json ? JSON.parse(r.stats_json) : null; } catch { stats = null; }
      return {
        id: r.id,
        title: r.title,
        created_at: r.created_at,
        lookups: r.lookups,
        sources: srcStmt.all(r.id),
        stats: stats && {
          words: stats.words || 0,
          rate: stats.rate || 0,
          learnedTokens: stats.learnedTokens || 0,
          awlRate: stats.awlRate || 0,
          cefr: stats.cefr || null,
        },
      };
    });
    return { total, totalAll, items };
  }

  getText(id) {
    return this.user.prepare("SELECT id, title, raw_text FROM texts WHERE id=?").get(id);
  }

  // 删除文章及其全部派生数据（事务）：笔记→卡片→复习记录→证据→查词日志；
  // 随之失去全部笔记的非概念词元一并清理（仍有他处笔记/考纲收录的词元保留）。
  deleteText(id) {
    const db = this.user;
    db.exec("BEGIN");
    try {
      const text = db.prepare("SELECT id FROM texts WHERE id=?").get(id);
      if (!text) { db.exec("ROLLBACK"); return { deleted: false, notes: 0, lexemesRemoved: 0 }; }
      const noteRows = db.prepare("SELECT id, lexeme_id FROM notes WHERE text_id=?").all(id);
      for (const n of noteRows) {
        db.prepare("DELETE FROM review_log WHERE card_id IN (SELECT id FROM cards WHERE note_id=?)").run(n.id);
        db.prepare("DELETE FROM cards WHERE note_id=?").run(n.id);
        db.prepare("DELETE FROM notes WHERE id=?").run(n.id);
      }
      db.prepare("DELETE FROM evidence_log WHERE source_type IN ('reader','resurface') AND source_ref=?").run(String(id));
      db.prepare("DELETE FROM lookup_log WHERE text_id=?").run(id);
      db.prepare("DELETE FROM text_sources WHERE text_id=?").run(id);
      db.prepare("DELETE FROM text_translations WHERE text_id=?").run(id);
      db.prepare("DELETE FROM unknown_encounters WHERE text_id=?").run(id);
      // 资产相遇不物理删（资产仍保留历史），按契约翻墓碑：反向视图（textLearnedSummary 等）不再计数
      db.prepare("UPDATE asset_encounters SET source_status='deleted' WHERE origin_kind='reading' AND origin_ref=?")
        .run(String(id));
      db.prepare("DELETE FROM resume_state WHERE scope='reading' AND ref_id=?").run(String(id));
      const orphans = db.prepare(
        `SELECT l.id, l.lemma FROM lexemes l WHERE l.pos<>'__concept__'
         AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.lexeme_id=l.id)`
      ).all();
      for (const o of orphans) {
        db.prepare("DELETE FROM evidence_log WHERE lexeme_id=?").run(o.id);
        db.prepare("DELETE FROM lexemes WHERE id=?").run(o.id);
        this.learned.delete(o.lemma.toLowerCase());
      }
      db.prepare("DELETE FROM texts WHERE id=?").run(id);
      db.exec("COMMIT");
      return { deleted: true, notes: noteRows.length, lexemesRemoved: orphans.length };
    } catch (e) {
      try { db.exec("ROLLBACK"); } catch { /* 已回滚 */ }
      throw e;
    }
  }
}

function nowMs() {
  return Date.now();
}

// 规范化文本（小写、去空白），用于同文去重与内置译文匹配
function jsNorm(s) {
  return s.toLowerCase().replace(/[ \r\n]+/g, "");
}

// HTML 实体解码（ADR-4：导入/翻译边界统一解码，阅读器只存纯文本）。
// 单遍扫描：命名实体覆盖常见集合，数字实体支持十进制/十六进制；&amp;amp; 这类双编码只解一层（防过度解码）。
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
  copy: "\u00a9", reg: "\u00ae", trade: "\u2122", hellip: "\u2026",
  mdash: "\u2014", ndash: "\u2013", lsquo: "\u2018", rsquo: "\u2019",
  ldquo: "\u201c", rdquo: "\u201d", deg: "\u00b0",
  // Latin-1 变音实体（网页导入常见的 &agrave; 等）
  agrave: "\u00e0", aacute: "\u00e1", acirc: "\u00e2", atilde: "\u00e3", auml: "\u00e4", aring: "\u00e5", aelig: "\u00e6",
  ccedil: "\u00e7", egrave: "\u00e8", eacute: "\u00e9", ecirc: "\u00ea", euml: "\u00eb",
  igrave: "\u00ec", iacute: "\u00ed", icirc: "\u00ee", iuml: "\u00ef", ntilde: "\u00f1",
  ograve: "\u00f2", oacute: "\u00f3", ocirc: "\u00f4", otilde: "\u00f5", ouml: "\u00f6", oslash: "\u00f8",
  ugrave: "\u00f9", uacute: "\u00fa", ucirc: "\u00fb", uuml: "\u00fc", yacute: "\u00fd", thorn: "\u00fe", szlig: "\u00df", yuml: "\u00ff",
  Agrave: "\u00c0", Aacute: "\u00c1", Acirc: "\u00c2", Atilde: "\u00c3", Auml: "\u00c4", Aring: "\u00c5", Aelig: "\u00c6",
  Ccedil: "\u00c7", Egrave: "\u00c8", Eacute: "\u00c9", Ecirc: "\u00ca", Euml: "\u00cb",
  Igrave: "\u00cc", Iacute: "\u00cd", Icirc: "\u00ce", Iuml: "\u00cf", Ntilde: "\u00d1",
  Ograve: "\u00d2", Oacute: "\u00d3", Ocirc: "\u00d4", Otilde: "\u00d5", Ouml: "\u00d6", Oslash: "\u00d8",
  Ugrave: "\u00d9", Uacute: "\u00da", Ucirc: "\u00db", Uuml: "\u00dc", Yacute: "\u00dd", Thorn: "\u00de",
};
function decodeHtmlEntities(s) {
  if (s == null) return s;
  // 数字实体必须带分号；命名实体允许省略分号（HTML 遗留行为），但其后须是非字母数字/等号边界
  return String(s).replace(/&(#x?[0-9a-fA-F]+;|[a-zA-Z]{2,10};?)/g, (m, body, off, whole) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const cp = hex ? parseInt(body.slice(2, -1), 16) : parseInt(body.slice(1, -1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return m;
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    const name = body.replace(/;$/, "");
    if (!Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)) return m;
    if (!m.endsWith(";")) {
      const after = whole[off + m.length] || "";
      if (/[A-Za-z0-9=]/.test(after)) return m;
    }
    return NAMED_ENTITIES[name];
  });
}

// —— 试卷 Markdown 适配器（V3）——
// 格式约定：
//   # 试卷标题
//   ::meta kind=cet6
//   ## Section/Passage 标题
//   文章正文……
//   ### Q1（或 ### 1）
//   题干
//   - A) 选项   （也接受 A. / A、）
//   - B) …
//   > answer: B
//   > analysis: 解析
//   > point: 考点标签（可选）
// 全局题号 q_index 按出现顺序跨 section 连续编号
function parsePaper(md) {
  const lines = String(md || "").replace(/\\r\n/g, "\n").split("\n");
  let title = "未命名试卷", kind = "cet6";
  const sections = [];
  let cur = null;       // 当前 section
  let q = null;         // 当前题目块（行缓冲）
  let globalIdx = 0;
  let lastDirective = "";
  const cueRe = /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.+)$/;
  const pushQ = () => {
    if (!q || !cur) return;
    const stem = q.stem.map((s) => s.trim()).filter(Boolean).join(" ").trim();
    const qtype = q.options.length ? "objective" : "subjective";
    const question = {
      index: globalIdx++, section: cur.title, section_kind: cur.kind, stem,
      options: q.options, qtype,
      answer: qtype === "objective" ? q.answer.toUpperCase() : "",
      analysis: q.analysis, point: q.point, model: q.model.trim(),
    };
    cur.questions.push(question);
    q = null;
    lastDirective = "";
  };
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    let m;
    if ((m = line.match(/^#\s+(.+)/))) { title = m[1].trim(); continue; }
    if ((m = line.match(/^::meta\s+kind=(\S+)/i))) { kind = m[1].toLowerCase(); continue; }
    if ((m = line.match(/^##\s+(.+)/))) {
      pushQ();
      cur = { title: m[1].trim(), kind: "reading", audio: "", passageLines: [], cues: [], questions: [] };
      sections.push(cur);
      continue;
    }
    // section 级指令（## 之后、题目之外）
    if (cur && !q && (m = line.match(/^::(kind|audio)\s+(.+)/i))) {
      const k = m[1].toLowerCase();
      if (k === "kind") { cur.kind = m[2].trim().toLowerCase(); }
      else cur.audio = m[2].trim();
      continue;
    }
    if ((m = line.match(/^###\s*(?:Q)?\s*\d+/i))) {
      pushQ();
      if (!cur) { cur = { title: "题目", kind: "reading", audio: "", passageLines: [], cues: [], questions: [] }; sections.push(cur); }
      q = { stem: [], options: [], answer: "", analysis: "", point: "", model: "" };
      continue;
    }
    if (!q && cur !== null) {
      cur.passageLines.push(line);
      const cm = line.match(cueRe);
      if (cm) {
        const secs = Number(cm[1]) * 60 + Number(cm[2]) + (cm[3] ? Number(cm[3].padEnd(3, "0").slice(0, 3)) / 1000 : 0);
        cur.cues.push({ t: secs, text: cm[4].trim() });
      }
      continue;
    }
    if (!q) continue;
    if ((m = line.match(/^[-*]?\s*([A-Da-d])[\)\.、]\s*(.+)/))) {
      q.options.push({ key: m[1].toUpperCase(), text: m[2].trim() });
      continue;
    }
    if ((m = line.match(/^>\s*(answer|analysis|point|model)\s*[:：]\s*(.*)/i))) {
      const k = m[1].toLowerCase();
      lastDirective = k;
      if (k === "answer") q.answer = m[2].trim().slice(0, 1);
      else if (k === "analysis") q.analysis = m[2].trim();
      else if (k === "point") q.point = m[2].trim();
      else q.model = m[2].trim();
      continue;
    }
    // > 续行：追加到上一条指令（范文/解析可多行）
    if ((m = line.match(/^>\s?(.*)$/)) && m[1].trim()) {
      if (lastDirective === "model") q.model += "\n" + m[1].trim();
      else if (lastDirective === "analysis") q.analysis += " " + m[1].trim();
      continue;
    }
    if (line.trim()) q.stem.push(line.trim());
  }
  pushQ();
  const sectionsOut = sections
    .map((s) => ({
      title: s.title, kind: s.kind, audio: s.audio,
      passage: s.passageLines
        .filter((l) => !cueRe.test(l.trim()))
        .join("\n").trim(),
      cues: s.cues, questions: s.questions,
    }))
    .filter((s) => s.questions.length > 0 || s.passage || s.cues.length);
  const questions = sectionsOut.flatMap((s) => s.questions);
  const errors = [];
  questions.forEach((qq) => {
    if (qq.qtype === "objective") {
      if (!/^[A-D]$/.test(qq.answer)) errors.push(`第 ${qq.index + 1} 题缺标准答案`);
      if (qq.options.length < 2) errors.push(`第 ${qq.index + 1} 题选项不足`);
    } else if (!qq.stem) {
      errors.push(`第 ${qq.index + 1} 题缺题干`);
    }
  });
  if (!questions.length) errors.push("没有解析出任何题目（用 ### Q1 起题）");
  return { title, kind, sections: sectionsOut, questions, errors };
}

// 句点保护：缩写（Dr./etc./Fig.）、连续首字母（U.S./e.g.）、小数（3.14）里的句点替换为占位符，等长不破坏索引
function maskSentenceDots(text) {
  return text
    .replace(/\d\.\d/g, (m) => m[0] + "\u0001" + m[2])
    .replace(/(?:[A-Za-z]\.){2,}/g, (m) => m.replace(/\./g, "\u0001"))
    .replace(/\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc|cf|al|No|Vol|Fig|Inc|Ltd|Eds?|pp?)\./g, (m) => m.replace(/\.$/, "\u0001"));
}
function extractSentence(text, offset) {
  const masked = maskSentenceDots(text);
  let start = Math.min(offset, text.length);
  while (start > 0) {
    const b = masked[start - 1];
    if (b === "." || b === "!" || b === "?" || b === "\n") break;
    start--;
  }
  let end = Math.min(offset, text.length);
  while (end < text.length) {
    const b = masked[end];
    if (b === "." || b === "!" || b === "?" || b === "\n") { end++; break; }
    end++;
  }
  return text.slice(start, end).trim();
}

function lemmaOfToken(core, low0) {
  const low = normApos(String(low0).toLowerCase());
  const l = core.canonical(low);
  if (l && core.words.has(l)) return l;
  return null;
}

// token 的词元是否解析为 target（同形优先，规避 lemma 表里的反向条目，如 lithium→lithiums）
function tokenIsLemma(core, low0, target) {
  const low = normApos(String(low0).toLowerCase());
  if (low === target) return core.words.has(target);
  const l = core.canonical(low);
  return !!l && l === target && core.words.has(l);
}

// 挖空：优先按词元精确匹配句中词（含变形），回退到前后缀正则
function buildCloze(core, sentence, lemma) {
  const targetWords = lemma.toLowerCase().split(/\s+/).filter(Boolean);
  if (!targetWords.length) return { text: sentence, miss: true, answer: lemma };
  const toks = core.annotate(sentence).filter((t) => t.label !== "punct");
    for (let i = 0; i + targetWords.length <= toks.length; i++) {
      let ok = true;
      for (let k = 0; k < targetWords.length; k++) {
        const low = toks[i + k].text.toLowerCase().replace(/[’']s$/, "");
        if (!tokenIsLemma(core, low, targetWords[k])) { ok = false; break; }
      }
    if (ok) {
      const s = toks[i], e = toks[i + targetWords.length - 1];
      const answer = sentence.slice(s.start, e.start + e.text.length);
      return {
        text: sentence.slice(0, s.start) + "＿＿＿＿" + sentence.slice(e.start + e.text.length),
        miss: false,
        answer,
      };
    }
  }
  const esc = targetWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const S = "(?:'s|s|es|ed|d|ing|er|ers|est|ly)?";
  const re = new RegExp(`\\b${esc.map((w) => w + S).join("[\\s\\-]+")}${S}\\b`, "i");
  const m = re.exec(sentence);
  if (m) {
    return {
      text: sentence.slice(0, m.index) + "＿＿＿＿" + sentence.slice(m.index + m[0].length),
      miss: false,
      answer: m[0],
    };
  }
  return { text: sentence, miss: true, answer: lemma };
}

module.exports = { Core, MIGRATIONS, extractSentence, buildCloze, nowMs, NEW_PER_DAY, parsePaper, decodeHtmlEntities, normalizeExpression, assetIdentity, shortHash };
