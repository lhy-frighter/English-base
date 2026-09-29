// 交接文档升 v2.16.0（S9-0 数据契约），幂等
const fs = require("fs");
const path = require("path");
const doc = path.resolve(__dirname, "..", "..", "交接文档.md");
let s = fs.readFileSync(doc, "utf8");
const orig = s;
let n = 0;
const NL = "\r\n";
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("未找到锚点: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}

const header =
"> 更新：2026-09-21 · 版本 v2.16.0（**S9-0 数据契约落地（一体化/仪表盘主线第一片）：migration v11 + 《S9-数据契约.md》+ 34 断言**；v2.15.1 书库删除入口接线）" + NL +
"> - **migration v11（user_version=11，可重入，DDL 与版本推进同事务）**：新增五表 `learning_sessions`（read/shadow 会话：session_key UNIQUE 幂等、开放生命周期 ended_at NULL+last_active_at/status、active_ms/amount≥0 与 locator_json json_valid CHECK）、`resume_state`（scope PK，段落 pi+段内偏移 ch+content_hash 锚点，不存滚动像素）、`app_settings`、`unknown_encounters`（lemma×text_id UNIQUE，UPSERT 按本次词频**覆盖不累加**；只收可解析但无 note 资产的词，专名/miss/中性区间不进）、`coverage_assessments`（能力趋势**不可变**快照，first_annotate 每篇一条永不更新，rate/snapshot_json CHECK）；`attempts` 加 `active_ms`——考试分钟锁死走前台活跃计时，历史 0 值只计套数不计分钟。" + NL +
"> - **日界唯一实现**：`Core.dayStart()/dayKey()` 本地时区午夜（禁止 UTC slice）。**删除语义**：deleteText 级联 unknown_encounters/resume_state；learning_sessions 与 coverage_assessments **保留走墓碑**。" + NL +
"> - **契约权威**：项目根《S9-数据契约.md》——事实表不双写（review_log/lookup_log/notes/attempts/text_translations/evidence_log 唯一权威）、仪表盘只做 UNION ALL 只读聚合、主活动分钟互斥（精读/复习/跟读/考试，查词/成卡/翻译只算次数不叠分钟）、深链信封 {ref_type,ref_id,locator_json,content_hash,title_snapshot}、连胜有效日门槛；S9-1/S9-2/S9-3/S10 一律以此为准。" + NL +
"> - **验证**：新增 `test/s9-contract.cjs` **34 断言**（结构落地、7 类脏数据被 CHECK 拒绝、两种半迁移形态重入恢复、日界、删文墓碑/级联）；**28 链 npm test 全绿**；真实 user.sqlite v10→v11 隐藏冒烟迁移成功（8 篇文章/3 词元完好，迁前手动备份 data/user.pre-v11.*.sqlite.bak）。本片无前端改动、无写入方；会话记录与活跃计时是下一片 S9-1。" + NL;
rep("> 更新：2026-09-21 · 版本 v2.15.1（",
    header + "> 更新：2026-09-21 · 版本 v2.15.1（",
"头部 v2.16 块");

rep("   ├─ test/unicode-words.cjs# v2.15 Latin 扩展字母回归（Łukasz/Jürgen/Çaglar/Gülçehre 整词 proper、句首保守 miss、M. Sugiyama、邮箱 URL 中性、法语 token、core 实体 12 断言）",
    "   ├─ test/unicode-words.cjs# v2.15 Latin 扩展字母回归（Łukasz/Jürgen/Çaglar/Gülçehre 整词 proper、句首保守 miss、M. Sugiyama、邮箱 URL 中性、法语 token、core 实体 12 断言）" + NL +
    "   ├─ test/s9-contract.cjs # v2.16 S9-0 数据契约（v11 五表+attempts.active_ms 结构、CHECK/UNIQUE 脏数据拒绝、迁移重入/中断恢复、日界函数、删文墓碑 34 断言）",
"代码地图测试链");

rep("npm test     # 27 链：", "npm test     # 28 链：", "§8 链数");
rep(" + unicode-words(12) + model-store(53)",
    " + unicode-words(12) + s9-contract(34) + model-store(53)",
"§8 s9 链接入");

rep("**下一步主线＝《后续规划-一体化与仪表盘 v2》：S9-0 数据契约（#102）→ S9 会话记录/断点续学/今日页 → S10 仪表盘 → S11 → V8 对话**",
    "**S9-0 数据契约已完成（v2.16.0，migration v11 + 《S9-数据契约.md》）**。下一步＝S9-1 阅读/跟读会话记录与最小前台活跃计时（#110：session_key 幂等 begin/heartbeat 20s/close、启动回收 open→abandoned、可见性/失焦暂停、unknown_encounters 在标注阶段 UPSERT 填充、coverage_assessments 首标写一条）→ S9-2 断点续学 → S9-3 今日页 → S10 仪表盘 → S11 → V8 对话",
"§9 主线推进");

if (s === orig) throw new Error("无修改");
fs.writeFileSync(doc, s, "utf8");
console.log("完成", n);
