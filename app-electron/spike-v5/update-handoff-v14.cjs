const fs = require("fs");
const p = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(p, "utf8");
const NL = "\r\n"; // 交接文档 CRLF
const block = [
  "> 更新：2026-09-24 · 版本 v2.42.0-dev（**#139A V9 数据契约：migration v14 独立学习资产层 + cards XOR + getDue 资产化**）",
  "> - **V9 方案定稿 v1.2.1**：产品单位从「词」升级为「任何值得反复学习的语言对象」。否决「给 lexemes 加 asset_kind」（会污染覆盖率/已知词/漏网词），改为独立 learning_assets（word/chunk/grammar/pronunciation/concept）+ 统一 FSRS + 多来源相遇/关系/能力证据。",
  "> - **migration v14（可重入、同事务）**：",
  ">   - learning_assets：asset_kind/status CHECK、payload_json json_valid；**identity_key（语义身份 UNIQUE(kind,identity_key)）与 idempotency_key（操作 nonce UNIQUE）拆分**；word↔lexeme CHECK（word 必有、非 word 不得有）+ 部分唯一索引（一个 lexeme 至多一个 word asset）。",
  ">   - asset_encounters：**locator_hash 入唯一键**（同篇两位置记两次）、**source_status**（删来源只墓碑化 encounter、保留快照，不整资产 tombstone）。",
  ">   - asset_relations：rel 白名单、禁自关联。",
  ">   - **asset_evidence：多途径能力证据**（correct/partial/wrong/improved/recurred/used_spontaneously），区别于 review_log 调度事实。",
  ">   - cards 重建为**严格 XOR**（note_id/asset_id 恰好一个非空、asset_id FK、索引重建），id、FSRS 字段与 review_log 关联全保留。",
  "> - **迁移运行器加固**：迁移前 wal_checkpoint + 文件备份（data/backups/pre-vN-ts.sqlite，保留 5 份；全新小库跳过）；表重建按标准流程在事务外 foreign_keys=OFF、提交后 ON；后置 integrity_check/foreign_key_check + 行数无漂移，失败 ROLLBACK 并恢复备份、中止启动。",
  "> - **getDue 资产化（#140 核心）**：取卡查询带 asset_id；兄弟卡互埋键 `note:<id>`/`asset:<id>`（asset 卡 note_id NULL 不再被误跳过/互埋）；资产卡通用 DTO，chunk/grammar/pron 专属渲染留 #142。",
  "> - **验证**：新链 test/v14-migration.cjs（40 checks：真实库副本 v13→v14 全字段逐行比对、约束拒绝、可重入、两张 asset 卡均取出）；全量 **44 链零失败**；tsc=0；vite build=0。真实库仍 v13，下次启动自动迁移（已在副本验证）。",
  "> - **下一步**：#139B 统一资产服务（创建/去重/相遇/关系/卡片工厂）；#141 DictPanel 抽取 + AssetCaptureSheet。",
  ">",
  "",
].join(NL);
const anchor = "# 个人英语能力底座 · 交接文档" + NL;
if (!s.startsWith(anchor)) throw new Error("doc header mismatch");
s = anchor + block + s.slice(anchor.length);
fs.writeFileSync(p, s);
console.log("handoff doc updated");
