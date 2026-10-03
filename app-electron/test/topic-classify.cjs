// test/topic-classify.cjs — 好文题材分类（#208）
//
// 重点验三件事：
//   1) **固定题材集**不被模型带跑——越界 topic 必须降级 other，否则分区会碎；
//   2) **解析容错**——模型返回的 JSON 千奇百怪（包 markdown、缺字段、串行号），
//      不能让一条脏回复把整批分类结果全丢掉；
//   3) **存储不误伤**——applyTopics 只写指定条目，topic=NULL 与空串语义不同。
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("PASS", name); }
  else { fail++; console.error("FAIL", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

// strip-types 下 .ts 可直接 require（与 translate-judge 测试同一套路）
const { TOPICS, TOPIC_IDS, topicLabel, buildPrompt, parseReply, chunk, BATCH_SIZE } =
  require("../src/topic-classify.ts");

const BATCH = [
  { guid: "g1", title: "AI chip breakthrough", summary: "A new processor architecture." },
  { guid: "g2", title: "Market outlook", summary: "Stocks rose after the earnings report." },
  { guid: "g3", title: "A memoir", summary: "The author reflects on childhood." },
];

// ——— 1) 题材集固定 ———
{
  check("题材恰好 7 类", TOPICS.length === 7, TOPICS.length);
  check("id 唯一", new Set(TOPICS.map((t) => t.id)).size === TOPICS.length);
  check("含 other 兜底", TOPIC_IDS.includes("other"));
  check("label 查询", topicLabel("tech") === "科技" && topicLabel("other") === "其他");
  check("未知 id 回退为其他", topicLabel("nope") === "其他");
}

// ——— 2) 提示词含固定选项与关键规则 ———
{
  const p = buildPrompt(BATCH);
  check("提示词列出每个题材 id", TOPICS.every((t) => p.includes(t.id)));
  check("提示词要求只从选项里选", p.includes("不要自创"));
  check("提示词说明观点类归 opinion", p.includes("opinion"));
  check("提示词要求 JSON 输出", p.includes("\"results\""));
  check("提示词含全部三条的 guid", BATCH.every((b) => p.includes(b.title)));
  // 900 字摘要截到 320，提示词固定部分约 400 字，总长应远小于未截断时的 1300+
  check("长摘要被截断", !buildPrompt([{ guid: "g", title: "t", summary: "x".repeat(900) }]).includes("x".repeat(400)));
  check("截断后长度合理", buildPrompt([{ guid: "g", title: "t", summary: "x".repeat(900) }]).length < 900);
}

// ——— 3) 解析：标准 JSON ———
{
  const raw = JSON.stringify({ results: [
    { i: 1, topic: "tech", gist: "芯片架构突破" },
    { i: 2, topic: "business", gist: "财报带动股市上涨" },
    { i: 3, topic: "culture", gist: "作者回忆童年" },
  ] });
  const r = parseReply(raw, BATCH);
  check("解析出 3 条", r.length === 3, r.length);
  check("guid 按序号回填正确", r[0].guid === "g1" && r[2].guid === "g3", r.map((x) => x.guid));
  check("topic 与 gist 正确", r[0].topic === "tech" && r[0].gist === "芯片架构突破", r[0]);
}

// ——— 4) 解析容错 ———
{
  check("包 markdown 代码块也能解析",
    parseReply('```json\n{"results":[{"i":1,"topic":"tech","gist":"x"}]}\n```', BATCH).length === 1);
  check("前后有杂文也能解析（抓最外层 {}）",
    parseReply('好的，结果如下：{"results":[{"i":1,"topic":"science","gist":"y"}]} 希望有用',
      BATCH)[0]?.topic === "science");
  check("完全非 JSON → 返回空数组而非抛错",
    parseReply("I cannot do that", BATCH).length === 0);
  check("results 非数组 → 空数组", parseReply('{"results":"x"}', BATCH).length === 0);
  check("空串 → 空数组", parseReply("", BATCH).length === 0);
  check("序号越界被丢弃", parseReply('{"results":[{"i":99,"topic":"tech"}]}', BATCH).length === 0);
}

// ——— 5) 越界 topic 降级 other（防止分区被脏数据带碎）——
{
  const r = parseReply(JSON.stringify({
    results: [
      { i: 1, topic: "科技", gist: "中文 topic 名" },
      { i: 2, topic: "TECH", gist: "大写" },
      { i: 3, topic: "science", gist: "合法" },
    ],
  }), BATCH);
  check("中文/大写 topic 降级为 other", r[0].topic === "other" && r[1].topic === "other", r.map((x) => x.topic));
  check("合法 topic 不受影响", r[2].topic === "science");
  check("缺 gist 时为空串", parseReply('{"results":[{"i":1,"topic":"tech"}]}', BATCH)[0].gist === "");
  check("gist 超长被截断",
    parseReply('{"results":[{"i":1,"topic":"tech","gist":"' + "x".repeat(200) + '"}]}', BATCH)[0].gist.length <= 60);
}

// ——— 6) 分批 ———
{
  check("batch size 为 12", BATCH_SIZE === 12, BATCH_SIZE);
  check("chunk 正确切分", chunk([1, 2, 3, 4, 5], 2).map((a) => a.length).join(",") === "2,2,1");
  check("空数组切出零批", chunk([], 12).length === 0);
  check("恰好整除不产生空批", chunk([1, 2, 3, 4], 2).length === 2);
}

// ——— 7) 存储：不误伤 ———
{
  const { Core } = require("../core.cjs");
  const core = new Core(fs.mkdtempSync(path.join(os.tmpdir(), "tpc-")));
  const now = Date.now();
  const ins = core.user.prepare(
    "INSERT INTO feed_items (feed_id,guid,title,link,summary,fetched_at,published_at,status) VALUES(?,?,?,?,?,?,?,'new')");
  ins.run("f1", "a", "A", "l", "s", now, now);
  ins.run("f1", "b", "B", "l", "s", now, now);
  ins.run("f1", "c", "C", "l", "s", now, now);

  const need = core.feedItemsNeedingTopic(50);
  check("未分类条目全部返回", need.length === 3, need.length);

  core.applyTopics([
    { feed_id: "f1", guid: "a", topic: "tech", gist: "甲" },
    { feed_id: "f1", guid: "b", topic: "other", gist: "" },
  ]);
  const need2 = core.feedItemsNeedingTopic(50);
  check("分类后剩余 1 条", need2.length === 1 && need2[0].guid === "c", need2.map((x) => x.guid));

  const ov = core.feedTopicsOverview();
  check("统计总数 3", ov.total === 3, ov);
  check("已分类 2 / 未分类 1", ov.classified === 2 && ov.unclassified === 1, ov);
  check("other 计入已分类（空串≠未分类）", ov.counts.other === 1, ov.counts);

  const tech = core.feedItemsByTopic("tech");
  check("按题材取到 1 条", tech.length === 1 && tech[0].guid === "a", tech.map((x) => x.guid));
  const unc = core.feedItemsByTopic("__unclassified__");
  check("未分类分区取到 c", unc.length === 1 && unc[0].guid === "c", unc.map((x) => x.guid));

  // 未知 guid 不应炸
  const r = core.applyTopics([{ feed_id: "f1", guid: "zzz", topic: "tech", gist: "x" }]);
  check("未知 guid 被忽略且不抛", r.applied === 0, r);
  check("空数组安全", core.applyTopics([]).applied === 0);
  check("非数组安全", core.applyTopics(null).applied === 0);
}

// —— 8) 迁移幂等 + 版本收敛（#208）——
{
  const { Core } = require("../core.cjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tpm-"));
  let core = new Core(dir);
  const cols = () => core.user.prepare("SELECT name FROM pragma_table_info('feed_items')").all().map((r) => r.name);
  check("首次建库即有 topic/gist", cols().includes("topic") && cols().includes("gist"));
  const v1 = core.user.prepare("PRAGMA user_version").get().user_version;
  core = new Core(dir);
  check("二次启动不抛错（迁移可重入）", cols().includes("topic"));
  check("版本号不再增长", core.user.prepare("PRAGMA user_version").get().user_version === v1, v1);

  // 存量库场景：版本号高于当前数组（历史上有迁移被合并移除）
  core.user.exec("PRAGMA user_version=" + (v1 + 5));
  let ok = true;
  try { core = new Core(dir); } catch { ok = false; }
  check("版本号超界时不抛错", ok);
  check("超界后仍能读到 topic 列", cols().includes("topic"));
  check("概览接口在超界库上可用", typeof core.feedTopicsOverview().total === "number");
}

console.log(`\ntopic-classify: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);