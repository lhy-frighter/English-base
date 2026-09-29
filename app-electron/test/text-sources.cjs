// S6 书库卡片化：migration v9 text_sources、多来源、全文 CEFR、listTexts 分页/排序/筛选、回填与删文级联
// 运行：node test/text-sources.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "text-sources-"));
const cores = [];
const openCore = () => { const c = new Core(dir); cores.push(c); return c; };
let core = openCore();
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}

// —— 1. migration v9 ——
check("user_version=15", core.user.prepare("PRAGMA user_version").get().user_version === 15);
check("text_sources 已建表", !!core.user.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='text_sources'").get());

// —— 2. annotateAndSave 写来源、幂等、多来源 ——
const longText = `The quick brown fox jumps over the lazy dog every morning near the quiet river.
Children play games while teachers read books and prepare lessons for the coming school term.
Weather changes quickly in mountain villages so families keep warm clothes and food inside.
Reading simple stories every day helps students remember words and understand new ideas faster.
A good learner listens carefully, writes notes, asks questions and reviews lessons before sleep.`;
const a = core.annotateAndSave(longText, "Long", { kind: "feed", label: "ScienceDaily", uri: "https://example.com/a", externalRef: "f1|g1" });
check("stats 含全文 CEFR", ["B1", "B2", "C1", "C2"].includes(a.stats.cefr), a.stats.cefr);
check("stats 含 lexicalWords", a.stats.lexicalWords > 0, a.stats.lexicalWords);
let srcs = core.listSources(a.text_id);
check("写入一条 feed 来源", srcs.length === 1 && srcs[0].kind === "feed" && srcs[0].label === "ScienceDaily", JSON.stringify(srcs));

// 同来源重复入库（好文重复点导入）——仍只有一条
core.annotateAndSave(longText, "Long", { kind: "feed", label: "ScienceDaily", uri: "https://example.com/a", externalRef: "f1|g1" });
srcs = core.listSources(a.text_id);
check("同来源幂等不重复", srcs.length === 1, String(srcs.length));

// 同一篇后来又被 URL 导入——多来源并存
core.annotateAndSave(longText, "Long", { kind: "url", uri: "https://other.example/x", externalRef: "https://other.example/x" });
srcs = core.listSources(a.text_id);
check("同文可多来源", srcs.length === 2 && srcs.some((s) => s.kind === "url"), String(srcs.length));

// 非法 kind 拒绝
let threw = false;
try { core.addTextSource(a.text_id, { kind: "hack" }); } catch { threw = true; }
check("非法来源类型抛错", threw);

// 短文不给 CEFR
const tiny = core.annotateAndSave("Hello world, my friend.", "Tiny", { kind: "paste" });
check("词汇词<8 时 cefr=null", tiny.stats.cefr === null, String(tiny.stats.cefr));
check("paste 空 externalRef 也可记录", core.listSources(tiny.text_id).length === 1);

// —— 3. listTexts：分页 / 排序 / 筛选 / 查词数 ——
const t2 = core.annotateAndSave(longText + " " + longText, "Long2", { kind: "file", label: "a.md", uri: "D:/a.md", externalRef: "a.md" });
const t3 = core.annotateAndSave("Benefit analysis research data evidence demonstrate significant consistent methodology framework.", "Paper", { kind: "file", label: "b.md", uri: "D:/b.md", externalRef: "b.md" });
// 给 t2 造 2 次查词
core.lookup("morning", "word", null, t2.text_id);
core.lookup("village", "word", null, t2.text_id);

let page = core.listTexts({});
check("listTexts 返回 {total,items}", typeof page.total === "number" && Array.isArray(page.items), JSON.stringify(Object.keys(page)));
check("默认按最近排序，首项 id 最大", page.items[0].id === t3.text_id, String(page.items[0].id));
const cardA = page.items.find((x) => x.id === a.text_id);
check("卡片带来源数组", cardA.sources.length === 2, String(cardA.sources.length));
check("卡片带 stats", !!cardA.stats && typeof cardA.stats.words === "number");
const card2 = page.items.find((x) => x.id === t2.text_id);
check("卡片带查词数", card2.lookups === 2, String(card2.lookups));

const byWords = core.listTexts({ sort: "words" });
check("按词数排序 Long2 在前", byWords.items[0].id === t2.text_id, String(byWords.items[0].id));
const byLookups = core.listTexts({ sort: "lookups" });
check("按查词数排序 t2 在前", byLookups.items[0].id === t2.text_id, String(byLookups.items[0].id));
const onlyFiles = core.listTexts({ kind: "file" });
check("来源筛选 file 只命中两篇", onlyFiles.total === 2 && onlyFiles.items.every((x) => x.sources.some((s) => s.kind === "file")), String(onlyFiles.total));
const onlyFeed = core.listTexts({ kind: "feed" });
check("来源筛选 feed 命中一篇", onlyFeed.total === 1, String(onlyFeed.total));
const cefrOfA = cardA.stats.cefr;
const byCefr = core.listTexts({ cefr: cefrOfA });
check("CEFR 筛选返回的卡片 CEFR 一致", byCefr.items.every((x) => x.stats?.cefr === cefrOfA), String(byCefr.total));
const noMatch = core.listTexts({ kind: "extension" });
const unfilteredTotal = core.listTexts({}).total;
check("筛选 0 命中时 total=0 但 totalAll 仍是全库数（防空态锁死）", noMatch.total === 0 && noMatch.totalAll === unfilteredTotal && noMatch.totalAll > 0, `${noMatch.total}/${noMatch.totalAll}/${unfilteredTotal}`);
const p1 = core.listTexts({ limit: 2, offset: 0 });
const p2 = core.listTexts({ limit: 2, offset: 2 });
check("分页 limit 生效", p1.items.length === 2 && p2.items.length >= 1);
check("分页不重叠", !p1.items.some((x) => p2.items.some((y) => y.id === x.id)));

// —— 4. 历史数据回填：feed_items + builtins ——
core.user.prepare(
  `INSERT INTO feeds(id,title,url,builtin,enabled,last_sync,etag,last_error,created_at)
   VALUES('f9','Test Feed','https://example.com/feed',0,1,0,'','',?)`
).run(Date.now());
core.user.prepare(
  `INSERT INTO feed_items(feed_id,guid,title,link,summary,fetched_at,status,text_id)
   VALUES('f9','g9','Item','https://example.com/item','',?,'imported',?)`
).run(Date.now(), t3.text_id);
core = openCore(); // 重开触发 backfillSources
let s3 = core.listSources(t3.text_id);
check("feed 历史导入回填来源", s3.some((s) => s.kind === "feed" && s.externalRef === "f9|g9"), JSON.stringify(s3));
check("回填幂等（再开一次不重复）", (() => { const c2 = openCore(); return c2.listSources(t3.text_id).filter((s) => s.kind === "feed").length === 1; })());

if (core.builtins.length > 0) {
  const b = core.builtins[0];
  const bt = core.annotateAndSave(b.text, b.title); // 模拟旧版本打开内置素材时没记来源
  const before = core.listSources(bt.text_id).filter((s) => s.kind === "builtin").length;
  const reopened = openCore();
  const after = reopened.listSources(bt.text_id).filter((s) => s.kind === "builtin").length;
  check("内置素材回填来源", before === 0 && after === 1, `${before}->${after} ${b.id}`);
} else {
  console.log("SKIP 内置素材回填（无内置素材）");
}

// —— 5. 旧 stats_json 补 CEFR ——
core.user.prepare("UPDATE texts SET stats_json=? WHERE id=?").run(JSON.stringify({ words: 100 }), tiny.text_id);
const c3 = openCore();
const fixed = JSON.parse(c3.user.prepare("SELECT stats_json FROM texts WHERE id=?").get(tiny.text_id).stats_json);
check("旧 stats 启动时补 cefr 字段", "cefr" in fixed && "lexicalWords" in fixed, JSON.stringify(fixed));

// —— 6. 删文级联 text_sources ——
const beforeDel = core.user.prepare("SELECT COUNT(*) n FROM text_sources WHERE text_id=?").get(t3.text_id).n;
core.deleteText(t3.text_id);
const afterDel = core.user.prepare("SELECT COUNT(*) n FROM text_sources WHERE text_id=?").get(t3.text_id).n;
check("删文级联清理来源", beforeDel >= 2 && afterDel === 0, `${beforeDel}->${afterDel}`);

core.user.close();
for (const c of cores) { try { c.user.close(); } catch { /* 已关闭 */ } }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);

