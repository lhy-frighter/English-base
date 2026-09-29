const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// —— 1) migrateV14：cards FK 加 ON DELETE CASCADE；重入条件同时检测 cascade；copy 保留 asset_id ——
R(
  `  // cards 重建为严格 XOR：已含 asset_id 则跳过（可重入）
  const cardsRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='cards'").get();
  if (cardsRow && cardsRow.sql && !cardsRow.sql.includes('asset_id')) {
    db.exec(\`
    CREATE TABLE cards_v14(
      id INTEGER PRIMARY KEY,
      note_id INTEGER REFERENCES notes(id),
      asset_id INTEGER REFERENCES learning_assets(id),
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
    INSERT INTO cards_v14
      (id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at)
      SELECT id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at
      FROM cards;
    DROP TABLE cards;
    ALTER TABLE cards_v14 RENAME TO cards;
    CREATE INDEX idx_cards_due ON cards(due, state);
    CREATE INDEX idx_cards_note ON cards(note_id);
    CREATE INDEX idx_cards_asset ON cards(asset_id);\`);
  }`,
  `  // cards 重建为严格 XOR：缺 asset_id 或缺资产级联时重建（可重入）
  const cardsRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='cards'").get();
  const cardsHasAsset = cardsRow && cardsRow.sql && cardsRow.sql.includes('asset_id');
  const cardsHasCascade = cardsRow && cardsRow.sql
    && cardsRow.sql.includes('REFERENCES learning_assets(id) ON DELETE CASCADE');
  if (cardsRow && (!cardsHasAsset || !cardsHasCascade)) {
    db.exec(\`
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
            OR (note_id IS NULL AND asset_id IS NOT NULL)));\`);
    if (cardsHasAsset) {
      db.exec(\`INSERT INTO cards_v14
        (id,note_id,asset_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at)
        SELECT id,note_id,asset_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at
        FROM cards;\`);
    } else {
      db.exec(\`INSERT INTO cards_v14
        (id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at)
        SELECT id,note_id,card_type,due,state,stability,difficulty,reps,lapses,last_review,created_at
        FROM cards;\`);
    }
    db.exec(\`
    DROP TABLE cards;
    ALTER TABLE cards_v14 RENAME TO cards;
    CREATE INDEX idx_cards_due ON cards(due, state);
    CREATE INDEX idx_cards_note ON cards(note_id);
    CREATE INDEX idx_cards_asset ON cards(asset_id);\`);
  }`,
  "migrateV14 cards block"
);

// —— 2) 构造器：migrate 后加自愈调用 ——
R(
  `    this.migrate();
    // S3 每日好文：RSS 源注册表 + 条目库`,
  `    this.migrate();
    // V9 自愈：已迁移库若 cards 资产 FK 无级联，按标准流程重建一次（幂等）
    this.repairAssetFkCascade();
    // S3 每日好文：RSS 源注册表 + 条目库`,
  "constructor call"
);

// —— 3) 新增 repairAssetFkCascade 方法（放在 migrate() 之前）——
R(
  `  migrate() {
    let v = this.user.prepare("PRAGMA user_version").get().user_version;`,
  `  // V9 自愈：cards.asset_id 的 FK 必须 ON DELETE CASCADE（资产删除时其卡随之删除）
  repairAssetFkCascade() {
    const row = this.user.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cards'").get();
    if (!row || !row.sql) return;
    if (!row.sql.includes('asset_id')) return;
    if (row.sql.includes('REFERENCES learning_assets(id) ON DELETE CASCADE')) return;
    this.user.exec("PRAGMA foreign_keys=OFF");
    this.user.exec("BEGIN");
    try {
      this.user.exec(\`CREATE TABLE cards_fix(
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
      CREATE UNIQUE INDEX idx_cards_asset_type ON cards(asset_id,card_type) WHERE asset_id IS NOT NULL;\`);
      this.user.exec("COMMIT");
    } catch (e) {
      try { this.user.exec("ROLLBACK"); } catch { /* ignore */ }
      throw e;
    } finally {
      this.user.exec("PRAGMA foreign_keys=ON");
    }
  }

  migrate() {
    let v = this.user.prepare("PRAGMA user_version").get().user_version;`,
  "repair method"
);

fs.writeFileSync(p, s);
console.log("core FK cascade repair added");
