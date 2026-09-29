// 交接文档升 v2.17.0（S9-1 会话记录+活跃计时+相遇/快照写入）
const fs = require("fs");
const path = require("path");
const doc = path.resolve(__dirname, "..", "..", "交接文档.md");
let s = fs.readFileSync(doc, "utf8");
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("未找到锚点: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}
const NL = "\r\n";
const header =
"> 更新：2026-09-21 · 版本 v2.17.0（**S9-1 学习会话记录 + 最小前台活跃计时 + 漏网词/覆盖率写入方落地**；v2.16.0 为 S9-0 数据契约）" + NL +
"> - **core 会话 API（learning_sessions 写入方）**：`beginSession`（session_key 幂等，IPC 重试不重复建行）、`heartbeatSession`（20s 刷新同一行，active_ms/amount 单调钳制，乱序重发不回退）、`closeSession`（幂等，关闭后心跳不改）、`reapAbandonedSessions`（构造时自动执行：open 且 last_active 早于 10 分钟 → abandoned，ended_at=last_active+20s）。杀进程最多损失约一个刷新周期。" + NL +
"> - **渲染端 `src/learning-session.ts`（SessionTracker）**：阅读页随文章打开 begin、切文章/回书库/卸载 close；跟读台挂载 begin、每完成一次比对 amount+1、卸载 close。20s 心跳；**仅 `visibilityState=visible && document.hasFocus()` 才累计 active_ms**（切标签页/窗口失焦暂停）；beforeunload 尽力 close，崩溃由主进程回收兜底。" + NL +
"> - **标注阶段两表写入**：`annotateAndSave` 收尾调用 `recordUnknownEncounters`（cardable 五类 label word/cap_word/word_lemma/contraction/compound 且尚无 lexeme 资产；proper/miss/number/punct 不进；每篇每 lemma 一行，UPSERT 按当前词频**覆盖不累加**；成卡后历史行保留）与 `recordFirstCoverage`（每篇首条不可变覆盖率快照，重新标注不覆盖不追加）。" + NL +
"> - **存量一次性回填**：构造时 `backfillCoverageAssessments`（旧文从 stats_json 补快照，snapshot_json 标 `backfilled:true`）、`backfillUnknownEncounters`（旧文重跑只读标注补相遇，已有行的文章跳过，幂等）。真实库已回填：8 条覆盖率快照、6823 条相遇事实。" + NL +
"> - **IPC**：sessionBegin/sessionHeartbeat/sessionClose（main map + preload + api.ts SessionDto 类型）。" + NL +
"> - **验证**：新增 `test/s9-session.cjs` **27 断言**（begin 幂等/非法枚举、心跳单调钳制、close 幂等、直接注入与构造两种回收、相遇词频覆盖、proper/miss 排除、成卡后保留、首标不可变、回填幂等）；**29 链 npm test 全绿**、tsc=0、vite build=0（index js 337.84kB）、隐藏冒烟通过、真实库回填核验。" + NL +
"> - **S11-b 提醒**：相遇表高频目前被 the/of/and 等功能词占据（learned 仅 3 词元，属契约正确行为）；漏网词回收 UI 排序时需按 frq/CEFR/AWL/考纲过滤功能词，不要直接按总次数推。" + NL;
rep("> 更新：2026-09-21 · 版本 v2.16.0（",
    header + "> 更新：2026-09-21 · 版本 v2.16.0（",
"头部 v2.17");

rep("   ├─ test/s9-contract.cjs # v2.16 S9-0 数据契约（v11 五表+attempts.active_ms 结构、CHECK/UNIQUE 脏数据拒绝、迁移重入/中断恢复、日界函数、删文墓碑 34 断言）",
    "   ├─ test/s9-contract.cjs # v2.16 S9-0 数据契约（v11 五表+attempts.active_ms 结构、CHECK/UNIQUE 脏数据拒绝、迁移重入/中断恢复、日界函数、删文墓碑 34 断言）" + NL +
    "   ├─ test/s9-session.cjs  # v2.17 S9-1 会话 begin/heartbeat/close、启动回收、相遇表/覆盖率写入与回填（27 断言）" + NL +
    "   ├─ src/learning-session.ts # v2.17 渲染端 SessionTracker（20s 心跳、仅前台可见计时、阅读/跟读会话生命周期）",
"代码地图");

rep("npm test     # 28 链：", "npm test     # 29 链：", "§8 链数");
rep(" + unicode-words(12) + s9-contract(34) + model-store(53)",
    " + unicode-words(12) + s9-contract(34) + s9-session(27) + model-store(53)",
"§8 链接入");

rep("**S9-0 数据契约已完成（v2.16.0，migration v11 + 《S9-数据契约.md》）**。下一步＝S9-1 阅读/跟读会话记录与最小前台活跃计时（#110：session_key 幂等 begin/heartbeat 20s/close、启动回收 open→abandoned、可见性/失焦暂停、unknown_encounters 在标注阶段 UPSERT 填充、coverage_assessments 首标写一条）→ S9-2 断点续学 → S9-3 今日页 → S10 仪表盘 → S11 → V8 对话",
    "**S9-1 会话记录已完成（v2.17.0）**。下一步＝**#103 S9-2 断点续学**（resume_state 写入：阅读锚点段落 pi+段内字符 ch+content_hash，5s 节流；冷启动/继续上次恢复；真 Electron 杀进程闸门：重开后落在原段落、open 会话被回收）→ #104 S9-3 今日页（唯一主按钮）→ S10 仪表盘（聚合 API 按《S9-数据契约》§4 四互斥主流 UNION ALL）→ S11 → V8 对话",
"§9 主线");

fs.writeFileSync(doc, s, "utf8");
console.log("完成", n);

