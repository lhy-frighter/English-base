const fs = require("fs");
const p = "D:/vibe coding/英语学习/V9-对话深化与多类型学习资产方案.md";
let s = fs.readFileSync(p, "utf8");
const NL = s.includes("\r\n") ? "\r\n" : "\n";
function mustReplace(oldStr, newStr, label) {
  if (!s.includes(oldStr)) throw new Error("NOT FOUND: " + label);
  if (s.split(oldStr).length - 1 > 1) throw new Error("NOT UNIQUE: " + label);
  s = s.replace(oldStr, newStr);
}

// 1) 头部加 v1.2.1 说明
mustReplace(
  "> v1.2 修订（据外部审查）：①**不把四类资产塞进 lexemes**——新建独立 `learning_assets`，覆盖率/已知词/漏网词仍只读 lexemes；②新增统一「转为练习」组件 AssetCaptureSheet（系统建议类型、用户裁决）；③类型专属载荷 + 来源/相遇/关系表；④发音资产区分听辨与产出；⑤短中文不拦截；⑥任务顺序改为先契约、再服务、交互前置、模式 spike、分类型复习、跨模块接线。",
  [
    "> v1.2 修订（据外部审查）：①**不把四类资产塞进 lexemes**——新建独立 `learning_assets`，覆盖率/已知词/漏网词仍只读 lexemes；②新增统一「转为练习」组件 AssetCaptureSheet（系统建议类型、用户裁决）；③类型专属载荷 + 来源/相遇/关系表；④发音资产区分听辨与产出；⑤短中文不拦截；⑥任务顺序改为先契约、再服务、交互前置、模式 spike、分类型复习、跨模块接线。",
    "> v1.2.1 迁移附录（据第二轮契约审查）：①**identity_key 与 idempotency_key 拆分**（语义身份 vs 操作 nonce）；②cards 严格 **XOR 归属** + 全量 CHECK/FK；③encounters 加 **locator_hash**（同篇两位置记两次）与 **source_status**（删来源只墓碑化 encounter）；④新增 **asset_evidence** 多途径能力证据表；⑤**getDue 并非天然兼容**——取卡/兄弟卡互埋/DTO 必须资产化，互埋键 note:<id>/asset:<id>；⑥迁移闸门 +4（见 §6/§8.4）。",
  ].join(NL),
  "header"
);

// 2) 整段替换 §3.2（含 SQL 与 cards 重建说明）
const start32 = "### 3.2 表结构（migration v14）";
const end32 = "### 3.3 类型专属载荷";
const i32 = s.indexOf(start32), j32 = s.indexOf(end32);
if (i32 === -1 || j32 === -1 || j32 < i32) throw new Error("3.2 anchors missing");

const new32 = [
  "### 3.2 表结构（migration v14，契约见 §8 附录）",
  "",
  "```sql",
  "-- learning_assets：identity_key 是语义身份（跨入口只建一次）；idempotency_key 是写操作 nonce",
  "CREATE TABLE learning_assets (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('word','chunk','grammar','pronunciation','concept')),",
  "  canonical TEXT NOT NULL,",
  "  gloss TEXT NOT NULL DEFAULT '',",
  "  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),",
  "  lexeme_id INTEGER,",
  "  identity_key TEXT NOT NULL,",
  "  content_hash TEXT NOT NULL DEFAULT '',",
  "  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','tombstoned')),",
  "  created_at INTEGER NOT NULL,",
  "  confirmed_at INTEGER NOT NULL DEFAULT 0,",
  "  idempotency_key TEXT NOT NULL,",
  "  CHECK ((asset_kind = 'word') = (lexeme_id IS NOT NULL)),  -- word 必有 lexeme，非 word 不得有",
  "  UNIQUE(asset_kind, identity_key),",
  "  UNIQUE(idempotency_key)",
  ");",
  "CREATE INDEX idx_assets_kind_created ON learning_assets(asset_kind, created_at);",
  "CREATE UNIQUE INDEX idx_assets_word_lexeme ON learning_assets(lexeme_id)",
  "  WHERE asset_kind='word' AND lexeme_id IS NOT NULL;  -- 一个 lexeme 至多一个 word asset",
  "",
  "-- 多来源相遇：locator_hash 区分同篇不同位置；删来源只改 source_status",
  "CREATE TABLE asset_encounters (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  asset_id INTEGER NOT NULL REFERENCES learning_assets(id) ON DELETE CASCADE,",
  "  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('reading','conversation','shadow','exam','syllabus')),",
  "  origin_ref TEXT NOT NULL DEFAULT '',",
  "  locator_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(locator_json)),",
  "  locator_hash TEXT NOT NULL DEFAULT '',",
  "  title_snapshot TEXT NOT NULL DEFAULT '',",
  "  sentence_snapshot TEXT NOT NULL DEFAULT '',",
  "  content_hash TEXT NOT NULL DEFAULT '',",
  "  source_status TEXT NOT NULL DEFAULT 'active' CHECK (source_status IN ('active','deleted')),",
  "  encountered_at INTEGER NOT NULL,",
  "  UNIQUE(asset_id, origin_kind, origin_ref, locator_hash)",
  ");",
  "CREATE INDEX idx_enc_origin ON asset_encounters(origin_kind, origin_ref);",
  "",
  "CREATE TABLE asset_relations (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  from_asset INTEGER NOT NULL REFERENCES learning_assets(id) ON DELETE CASCADE,",
  "  to_asset INTEGER NOT NULL REFERENCES learning_assets(id) ON DELETE CASCADE,",
  "  rel TEXT NOT NULL CHECK (rel IN ('contains','exemplifies','pronunciation_of','variant_of')),",
  "  detail_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail_json)),",
  "  CHECK (from_asset <> to_asset),",
  "  UNIQUE(from_asset, to_asset, rel)",
  ");",
  "",
  "-- asset_evidence：多途径能力证据（区别于 review_log 的调度事实）",
  "CREATE TABLE asset_evidence (",
  "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "  asset_id INTEGER NOT NULL REFERENCES learning_assets(id) ON DELETE CASCADE,",
  "  dimension TEXT NOT NULL,",
  "  result TEXT NOT NULL CHECK (result IN ('correct','partial','wrong','improved','recurred','used_spontaneously')),",
  "  source_kind TEXT NOT NULL CHECK (source_kind IN ('reading','conversation','shadow','exam','syllabus','review')),",
  "  source_ref TEXT NOT NULL DEFAULT '',",
  "  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json)),",
  "  occurred_at INTEGER NOT NULL,",
  "  idempotency_key TEXT NOT NULL UNIQUE",
  ");",
  "CREATE INDEX idx_evidence_asset ON asset_evidence(asset_id, occurred_at);",
  "```",
  "",
  "cards 表在 v14 内**重建**（标准 SQLite 重建，id 全保留，review_log 不受影响），归属严格 **XOR**：",
  "",
  "```sql",
  "-- note_id 与 asset_id 必须恰好一个非空；asset_id 外键到 learning_assets",
  "CHECK (",
  "  (note_id IS NOT NULL AND asset_id IS NULL) OR",
  "  (note_id IS NULL AND asset_id IS NOT NULL)",
  ")",
  "-- asset_id INTEGER REFERENCES learning_assets(id)；重建 idx_cards_due，新增 idx_cards_asset",
  "```",
  "",
];
s = s.slice(0, i32) + new32.join(NL) + s.slice(j32);

// 3) §4.4 今日页 bullet 修正
mustReplace(
  "- **今日页**：getDue 队列天然包含新卡，无需改调度。",
  "- **今日页/取卡**：FSRS 排程算法与每日配额继续共用；但**取卡查询、兄弟卡互埋、渲染 DTO 必须资产化**（现有 getDue 固定 JOIN notes/lexemes，asset 卡 note_id 为 NULL 会被误跳过或互埋）；互埋键统一为 `note:<id>` / `asset:<id>`。字段与所有权在 #139A 定死，渲染留 #142。",
  "today bullet"
);

// 4) #139A 任务行更新
mustReplace(
  "| 139A | V9 数据契约 | migration v14：learning_assets / asset_encounters / asset_relations、cards 重建；纯函数 DDL 测试 | 迁移在真实库成功；**覆盖率/已知词/漏网词逐字不变**；tsc=0 |",
  "| 139A | V9 数据契约 | migration v14：learning_assets（identity/idempotency 拆分）/ encounters（locator_hash、source_status）/ relations / **asset_evidence**、cards XOR 重建、取卡与互埋资产化；先写失败测试再写 DDL | 夹具库迁移成功且可重入；**覆盖率/已知词/漏网词逐字不变**；§6 闸门 1–12 全过；tsc=0 |",
  "task 139A"
);

// 5) §6 追加闸门 9–12 与业务测试
mustReplace(
  "8. pronunciation 听辨成绩不提升口语能力指标。",
  [
    "8. pronunciation 听辨成绩不提升口语能力指标。",
    "9. 原 cards 全字段、ID、FSRS 状态及 review_log 关联逐行一致。",
    "10. `foreign_key_check` / `integrity_check` / 孤儿卡检查全部为零。",
    "11. 迁移重复执行不产生新表、新卡或任何数据变化。",
    "12. 自动迁移前备份；后置校验失败必须整体回滚，不得启动半迁移数据库。",
    "",
    "**业务测试（夹具）**：①同一资产经不同请求只建一次，但同一文章两个不同位置记两次 encounter；②队列中同时存在 ≥2 张 asset 卡时均可取出，不因 note_id=NULL 被互埋。",
  ].join(NL),
  "gates"
);

// 6) 文末追加 §8 附录
s = s.trimEnd() + NL + NL + [
  "## 8. 迁移附录 v1.2.1（#139A 契约）",
  "",
  "### 8.1 identity_key 生成规则（按类型）",
  "",
  "| kind | identity_key | 说明 |",
  "|---|---|---|",
  "| word | `lex:<lexeme_id>` | 一个 lexeme 至多一个 word asset（部分唯一索引） |",
  "| chunk | `chk:<规范化英文表达>` | lowercase、空白折叠、弯引号归一 |",
  "| grammar | `gra:<规范模板>|<exercise_form>` | 模板 + 练习形式联合身份 |",
  "| pronunciation | `pron:<目标片段>|<problem_type>` | 片段 + 问题类型 |",
  "| concept | `con:<paper_id>:<q_index>:<考点hash>` | 稳定业务键，不随文案变化 |",
  "",
  "- idempotency_key 只代表一次写操作（IPC 重试/双击防重），**不承担语义身份**；语义查重先按 identity_key，命中则转走「追加 encounter」分支。",
  "",
  "### 8.2 asset_evidence：多途径能力证据",
  "",
  "- 定位：`review_log` 是**调度事实**（卡片评分→FSRS）；`asset_evidence` 是**能力证据**（任意学习途径都可写入），二者不互相替代。",
  "- 典型记录：",
  "  - 阅读中正确理解某 chunk（chunk_understood, source=reading）；",
  "  - 对话中主动使用某表达（result=used_spontaneously, source=conversation）；",
  "  - 语法改写/找错成功（grammar_transform_ok / grammar_error_spot）；",
  "  - 跟读中发音问题 recurred 或 improved（source=shadow，payload 带相似度/时间戳）；",
  "  - 考试中某 concept 答对（source=exam）；",
  "  - FSRS 卡片复习结果（source=review，payload 带 card_id/rating）。",
  "- 每条证据带独立 idempotency_key，同一事件不重复计；仪表盘「真实能力证据」区只读本表与 coverage_assessments。",
  "",
  "### 8.3 来源删除的墓碑语义",
  "",
  "- 删除一篇文章/一次会话来源：**只把对应 encounter.source_status 置为 deleted（保留标题/句子快照）**，资产与卡片保留；",
  "- 资产仍有其他 active encounter 时状态不变；没有任何 active encounter 也不自动 tombstone（卡片复习可能仍在进行），仅在看板/列表降权；",
  "- 禁止因删除单一来源而把整个资产标 tombstoned。",
  "",
  "### 8.4 迁移操作流程",
  "",
  "1. 迁移前自动复制 user.sqlite 到带时间戳的备份；记录迁移前覆盖率/已知词/漏网词快照与 cards、review_log 行数；",
  "2. 每版迁移在同一事务内完成（DDL + PRAGMA user_version），函数体可重入（IF NOT EXISTS/列检测）；",
  "3. 迁移后执行：覆盖率快照比对、cards 逐行比对、foreign_key_check、integrity_check、孤儿卡查询；",
  "4. 任一项失败 → 恢复备份、保留原 user_version、中止启动，不允许半迁移库上线。",
].join(NL) + NL;

fs.writeFileSync(p, s);
console.log("v1.2.1 applied");
