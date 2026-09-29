// 交接文档升 v2.20.0（S10-1）
const fs = require("fs");
const fp = "D:/vibe coding/英语学习/交接文档.md";
let s = fs.readFileSync(fp, "utf8");
const NL = s.includes("\r\n") ? "\r\n" : "\n";
const entry = [
"> 更新：2026-09-21 · 版本 v2.20.0（**S10-1 仪表盘聚合 API：四互斥主流分钟 + 动作次数 + 连胜 + 日下钻，只读零双写**；前端 S10-2 待做）",
"> - **口径权威**：《S9-数据契约.md》§4。事实表不双写——review_log/lookup_log/notes/attempts/text_translations/learning_sessions 仍是唯一事实源，聚合层只读 UNION。",
"> - **core 五方法（插在 V3 考试模式注释前）**：`_validDay(a)`（有效日：复习≥10 卡 / read≥300词且≥3min / shadow≥3句 / 完成1套卷）、`_aggregateDaily(from,to)` 返回 Map<dayKey,agg>（read/shadow 取 learning_sessions.active_ms 且 status!='open'；review 取 review_log.elapsed_ms；exam 取 attempts.active_ms，=0 不计分钟；lookup/note/translation 只计次数）、`_streak(map)`（longest 按日历日相邻；current 今天有效从今天否则从昨天起向前）、`insights(rangeDays=30)`（7–365 钳制；days 日序列+totals+streak+coverage 不可变快照 LEFT JOIN texts 墓碑+history_note）、`dayTimeline(key)`（YYYY-MM-DD 校验；会话/套卷逐条带 deleted 墓碑，复习/查词/成卡/翻译汇总条，ts 倒序）。日界统一 dayStart/dayKey。",
"> - **能力趋势**：只读 coverage_assessments（first_annotate 不可变，未来 parallel_test 同表），禁读会被重标注覆盖的 texts.stats_json；资源删除后 title=null 且 deleted=true。",
"> - **IPC**：insights(days)、dayTimeline(key)（main map + preload + api.ts，新增 Insights/InsightDay/CoveragePoint/DayTimeline/TimelineEntry 类型）。",
"> - **验证**：新增 `test/s10-insights.cjs` **20 断言**（空库全 0/非法日期拒绝、首标快照、四主流分钟、次数不折分钟、开放会话不计、跨天 current/longest 连胜与缺口、日下钻汇总条、删文会话与覆盖率墓碑）；**32 链 npm test 全绿**、tsc=0、vite build=0（index js 343.43kB/gzip 108.85kB）。",
"> - **下一片 #106 S10-2 前端**：堆叠柱只画四互斥主流分钟、次数走悬停/独立区；「本周投入」与「能力趋势」分区（parallel_test 上线前能力区显示占位说明，不得用投入指标冒充能力）；日柱点击调 dayTimeline 下钻；旧 dashboard() 页面迁移不留死链；纯 CSS/SVG 不引库；目视闸门只能用户本人完成。",
""
].join(NL);
if (s.includes("v2.20.0")) { console.log("skip"); }
else {
  const head = "# 个人英语能力底座 · 交接文档" + NL;
  if (!s.startsWith(head)) throw new Error("头部锚点缺失");
  s = head + NL + entry + s.slice(head.length);
  fs.writeFileSync(fp, s, "utf8");
  console.log("patched v2.20.0");
}
