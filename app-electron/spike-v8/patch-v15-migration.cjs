const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");

// 1) 注册 migrateV15 到 MIGRATIONS
const regAnchor = "  migrateV13,\n  migrateV14,\n];";
if (s.indexOf(regAnchor) === -1) throw new Error("MIGRATIONS anchor not found");
if (s.indexOf("  migrateV15,\n];") === -1) {
  s = s.replace(regAnchor, "  migrateV13,\n  migrateV14,\n  migrateV15,\n];");
}

// 2) 插入 migrateV15 函数（在 migrateV14 函数结束后）
const fnAnchor = "  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_asset_type\n    ON cards(asset_id, card_type) WHERE asset_id IS NOT NULL;`);\n}\n";
if (s.indexOf(fnAnchor) === -1) throw new Error("migrateV14 end anchor not found");
if (s.indexOf("function migrateV15(") !== -1) {
  console.log("fn already present, only registration patched");
} else {
  const fn = fnAnchor + `
// v15：①asset_evidence 重建 result CHECK 扩 10 值；②shadow_sentences 加来源；③debrief_drafts
function migrateV15(db) {
  // ① evidence 重建（旧 6 值全部包含在新 10 值内，直接拷贝；可重入：检测 CHECK 口径）
  const evRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='asset_evidence'").get();
  const evHasTen = evRow && evRow.sql && evRow.sql.includes('practice_observation')
    && evRow.sql.includes('used_prompted') && evRow.sql.includes('used_after_correction')
    && evRow.sql.includes('recognized');
  if (evRow && !evHasTen) {
    db.exec(\`
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
    CREATE INDEX idx_evidence_asset ON asset_evidence(asset_id, occurred_at);\`);
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
  db.exec(\`
  CREATE TABLE IF NOT EXISTS debrief_drafts(
    draft_key TEXT PRIMARY KEY,
    origin_kind TEXT NOT NULL CHECK(origin_kind IN ('reading','conversation','shadow','exam')),
    origin_ref TEXT NOT NULL,
    candidates_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(candidates_json)),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','skipped')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(origin_kind, origin_ref));
  CREATE INDEX IF NOT EXISTS idx_debrief_status ON debrief_drafts(status, updated_at);\`);
}
`;
  s = s.replace(fnAnchor, fn);
}

fs.writeFileSync(p, s);
console.log("patched v15 ok");
