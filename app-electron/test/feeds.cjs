// test/feeds.cjs — S3 RSS 同步地基回归（解析 fixture + 假 fetcher，全程离线）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseFeed, stripHtml, defaultFetcher, ensureFeedXml } = require("../feeds.cjs");
const { Core } = require("../core.cjs");

const FX = path.join(__dirname, "fixtures");
const aeonXml = fs.readFileSync(path.join(FX, "feed-aeon.xml"), "utf8");
const nilXml = fs.readFileSync(path.join(FX, "feed-newsinlevels.xml"), "utf8");
const sdXml = fs.readFileSync(path.join(FX, "feed-sciencedaily.xml"), "utf8");
const DEFAULT_MAP = {
  "https://aeon.co/feed.rss": aeonXml,
  "https://www.newsinlevels.com/feed/": nilXml,
  "https://www.sciencedaily.com/rss/all.xml": sdXml,
};
const DEFAULT_TOTAL = 20 + 10 + 60;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title>First &amp; foremost</title>
    <link rel="self" href="https://x.test/feed/e1"/>
    <link rel="alternate" href="https://x.test/e1"/>
    <id>tag:x.test,2026:e1</id>
    <published>2026-09-01T10:00:00Z</published>
    <summary><![CDATA[<p>Hello <b>atom</b> world</p>]]></summary>
  </entry>
  <entry>
    <title>Relative link case</title>
    <link href="/posts/e2"/>
    <id>tag:x.test,2026:e2</id>
    <updated>2026-09-02T10:00:00Z</updated>
    <content>Body text only</content>
  </entry>
</feed>`;

test("RSS2.0 解析：Aeon fixture 20 项，CDATA/HTML/日期正确", () => {
  const f = parseFeed(aeonXml, "https://aeon.co/feed.rss");
  assert.match(f.title, /Aeon/i);
  assert.equal(f.items.length, 20);
  const it = f.items[0];
  assert.ok(it.title.length > 0, "title 非空");
  assert.match(it.link, /^https:\/\//);
  assert.ok(it.guid.length > 0);
  assert.ok(it.publishedAt > 0, "pubDate 解析为毫秒");
  assert.doesNotMatch(it.summary, /<[a-z/][^>]*>/i, "summary 无 HTML 标签");
  assert.doesNotMatch(it.summary, /<!\[CDATA/, "summary 无 CDATA 残留");
  assert.ok(it.summary.length <= 601, "summary 截断");
});

test("RSS2.0 解析：News in Levels fixture 10 项", () => {
  const f = parseFeed(nilXml);
  assert.equal(f.items.length, 10);
  assert.ok(f.items.every((i) => /^https?:\/\//.test(i.link)), "link 均为绝对 URL");
  assert.ok(f.items[0].publishedAt > 0);
});

test("RSS2.0 解析：ScienceDaily fixture 60 项", () => {
  const f = parseFeed(sdXml);
  assert.equal(f.items.length, 60);
  assert.ok(f.items.every((i) => /^https?:\/\//.test(i.link)), "link 均为绝对 URL");
});

test("Atom 解析：alternate 优先、相对链接补全、实体解码、updated 兜底", () => {
  const f = parseFeed(ATOM, "https://x.test/feed");
  assert.equal(f.items.length, 2);
  assert.equal(f.items[0].title, "First & foremost");
  assert.equal(f.items[0].link, "https://x.test/e1");
  assert.equal(f.items[0].summary, "Hello atom world");
  assert.equal(f.items[1].link, "https://x.test/posts/e2");
  assert.equal(f.items[1].summary, "Body text only");
  assert.ok(f.items[1].publishedAt > 0);
});

test("stripHtml 去标签解码实体折叠空白", () => {
  assert.equal(stripHtml("<p>a &amp; b</p>\n<br><b>c</b>"), "a & b c");
});

test("ensureFeedXml 形态守卫", () => {
  assert.throws(() => ensureFeedXml("<html>not a feed</html>"), /RSS/);
  assert.doesNotThrow(() => ensureFeedXml(aeonXml));
  assert.throws(() => ensureFeedXml(""), /RSS/);
});

function tmpCore(fetcher) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feeds-"));
  const core = new Core(dir, { bundledPacks: false, feedFetcher: fetcher });
  return { dir, core };
}
const fakeFetcher = (map, { etag = "" } = {}) => async (url) => {
  if (url in map) {
    const v = map[url];
    if (v === "304") return { notModified: true, etag };
    if (v instanceof Error) throw v;
    return { xml: v, etag, notModified: false };
  }
  throw new Error("unexpected url " + url);
};

test("DB：默认源 seed、刷新落库、guid 去重、新鲜跳过", async () => {
  const { core } = tmpCore(fakeFetcher(DEFAULT_MAP));
  assert.equal(core.feeds.listFeeds().length, 3);
  let r = await core.feeds.refreshAll();
  assert.equal(r.added, DEFAULT_TOTAL);
  assert.equal(core.feeds.listItems({ limit: 500 }).total, DEFAULT_TOTAL);
  // 未过期不重复拉
  r = await core.feeds.refreshAll();
  assert.ok(r.results.every((x) => x.skipped));
  // 强制刷新：零新增、有更新，不产生重复
  r = await core.feeds.refreshAll({ force: true });
  assert.equal(r.added, 0);
  assert.ok(r.results.reduce((n, x) => n + (x.updated || 0), 0) >= DEFAULT_TOTAL - 2);
  assert.equal(core.feeds.listItems({ limit: 500 }).total, DEFAULT_TOTAL);
  core.user.close();
});

test("304 Not Modified：只更新同步时间", async () => {
  const { core } = tmpCore(fakeFetcher(DEFAULT_MAP));
  await core.feeds.refreshAll({ force: true });
  const f2 = new Core(core.dataDir, {
    bundledPacks: false,
    feedFetcher: fakeFetcher({
      "https://aeon.co/feed.rss": "304",
      "https://www.newsinlevels.com/feed/": "304",
      "https://www.sciencedaily.com/rss/all.xml": "304",
    }),
  });
  const r = await f2.feeds.refreshAll({ force: true });
  assert.ok(r.results.every((x) => x.notModified), "三源均 304");
  assert.equal(f2.feeds.listItems({ limit: 500 }).total, DEFAULT_TOTAL);
  f2.user.close(); core.user.close();
});

test("源增删启停：内置删除=停用可恢复；用户源删除连带条目", async () => {
  const userUrl = "https://example.com/feed.xml";
  const { core } = tmpCore(fakeFetcher({ ...DEFAULT_MAP, [userUrl]: ATOM }));
  await core.feeds.refreshAll({ force: true }); // 先拉默认源
  await core.feeds.addFeed(userUrl);
  const userFeed = core.feeds.listFeeds().find((f) => f.url === userUrl);
  assert.ok(userFeed && !userFeed.builtin);
  assert.equal(core.feeds.listItems({ limit: 500 }).total, DEFAULT_TOTAL + 2);
  // 重复添加同 URL：复用并重新启用
  const again = await core.feeds.addFeed(userUrl);
  assert.ok(again.reused);
  assert.equal(core.feeds.listFeeds().length, 4);
  // 内置源删除=停用
  const rm1 = core.feeds.removeFeed("builtin-aeon");
  assert.deepEqual(rm1, { removed: true, builtin: true });
  assert.equal(core.feeds.listFeeds().find((f) => f.id === "builtin-aeon").enabled, false);
  core.feeds.toggleFeed("builtin-aeon", true);
  assert.equal(core.feeds.listFeeds().find((f) => f.id === "builtin-aeon").enabled, true);
  // 用户源物理删除，条目连带
  const rm2 = core.feeds.removeFeed(userFeed.id);
  assert.deepEqual(rm2, { removed: true, builtin: false });
  assert.equal(core.feeds.listItems({ limit: 500 }).total, DEFAULT_TOTAL);
  assert.equal(core.feeds.listFeeds().length, 3);
  core.user.close();
});

test("内置源退役：旧 builtin id 在 seed 时被物理清理（含条目），用户源不受影响", async () => {
  const userUrl = "https://example.com/keep.xml";
  const { core } = tmpCore(fakeFetcher({ ...DEFAULT_MAP, [userUrl]: ATOM }));
  await core.feeds.refreshAll({ force: true });
  await core.feeds.addFeed(userUrl);
  // 模拟旧版本内置源（已退役的 builtin-voa-le）
  core.user.prepare("INSERT INTO feeds(id,title,url,builtin,enabled,created_at) VALUES('builtin-voa-le','old','https://x',1,1,?)")
    .run(Date.now());
  core.user.prepare("INSERT OR IGNORE INTO feed_items(feed_id,guid,title,link,summary,author,published_at,fetched_at,status) VALUES('builtin-voa-le','g1','t','https://x/t','s','',?,?, 'new')")
    .run(Date.now(), Date.now());
  assert.ok(core.feeds.listFeeds().some((f) => f.id === "builtin-voa-le"));
  // 同目录重新构造（应用升级重启）触发 seed 退役
  const core2 = new Core(core.dataDir, { bundledPacks: false, feedFetcher: fakeFetcher(DEFAULT_MAP) });
  const ids = core2.feeds.listFeeds().map((f) => f.id);
  assert.ok(!ids.includes("builtin-voa-le"), "旧内置源应被退役");
  assert.ok(ids.includes("builtin-newsinlevels") && ids.includes("builtin-sciencedaily"));
  assert.ok(ids.some((i) => !i.startsWith("builtin-")), "用户源保留");
  assert.equal(core2.feeds.getItem("builtin-voa-le", "g1"), null, "旧条目级联删除");
  core2.user.close(); core.user.close();
});

test("非法 URL / 拉取失败：addFeed 拒绝非法协议；失败留 last_error 不影响其他源", async () => {
  const { core } = tmpCore(fakeFetcher({
    ...DEFAULT_MAP,
    "https://www.sciencedaily.com/rss/all.xml": new Error("network down"),
  }));
  await assert.rejects(core.feeds.addFeed("ftp://nope/x.xml"), /http/);
  const r = await core.feeds.refreshAll({ force: true });
  const sd = r.results.find((x) => x.id === "builtin-sciencedaily");
  assert.equal(sd.ok, false);
  const row = core.feeds.listFeeds().find((f) => f.id === "builtin-sciencedaily");
  assert.match(row.last_error, /network down/);
  assert.equal(core.feeds.listItems({ limit: 500 }).total, 30); // 另外两源不受影响
  // 非 feed 形态由守卫拦截（真实网络路径在 defaultFetcher 内调用同一函数）
  assert.throws(() => ensureFeedXml("<html>not a feed</html>"), /RSS/);
  core.user.close();
});

test("条目状态机与覆盖率缓存：imported/dismissed/visible 过滤", async () => {
  const { core } = tmpCore(fakeFetcher({ "https://aeon.co/feed.rss": aeonXml }));
  await core.feeds.refreshAll({ force: true });
  const first = core.feeds.listItems({ limit: 1 }).items[0];
  core.feeds.setAnalysis(first.feed_id, first.guid, { words: 812, known: 760, rate: 93.6, cefr: "C1" });
  core.feeds.setStatus(first.feed_id, first.guid, "imported", 42);
  const saved = core.user.prepare("SELECT * FROM feed_items WHERE feed_id=? AND guid=?").get(first.feed_id, first.guid);
  assert.equal(saved.status, "imported");
  assert.equal(saved.text_id, 42);
  assert.equal(saved.words, 812);
  assert.equal(saved.cefr, "C1");
  core.feeds.setStatus(first.feed_id, first.guid, "dismissed");
  assert.equal(core.feeds.listItems({ status: "visible", limit: 200 }).total, 19);
  assert.equal(core.feeds.listItems({ status: "dismissed", limit: 200 }).total, 1);
  assert.equal(core.feeds.listItems({ status: "all", limit: 200 }).total, 20);
  core.user.close();
});

test("S4 覆盖率/CEFR 分析：建卡后写入缓存、口径合法、二次运行零重复", async () => {
  const { core } = tmpCore(fakeFetcher(DEFAULT_MAP));
  await core.feeds.refreshAll({ force: true });
  // 先空跑：没有任何已学词，覆盖率应为 0 附近，CEFR 仍可估
  let r = core.analyzeFeedItems({ limit: 30 });
  assert.ok(r.analyzed >= 10, `应分析多条，实际 ${r.analyzed}`);
  const filled = core.user.prepare("SELECT COUNT(*) n FROM feed_items WHERE rate IS NOT NULL").get().n;
  assert.equal(filled, r.analyzed);
  // 从某条摘要里挑一个可解析普通词建卡，再分析新条目，覆盖率必须能上升
  const { items } = core.feeds.listItems({ limit: 50 });
  const target = items.find((i) => i.summary.length > 100);
  const toks = core.annotate(target.summary).filter((t) => t.label === "word" || t.label === "word_lemma");
  assert.ok(toks.length > 0);
  const w = toks.find((t) => {
    const e = core.lookup(t.text, t.label, t.phrase ?? null, null);
    return e && e.cardable !== false;
  });
  assert.ok(w, "摘要中应至少有一个可成卡普通词");
  core.createStandaloneNote({ word: w.text, label: w.label, phrase: w.phrase, sense: "" });
  // 清掉缓存模拟新条目
  core.user.prepare("UPDATE feed_items SET rate=NULL,words=NULL,known=NULL,cefr=''").run();
  r = core.analyzeFeedItems({ limit: 100 });
  assert.ok(r.analyzed >= 30);
  for (const row of core.user.prepare("SELECT words,known,rate,cefr FROM feed_items WHERE rate IS NOT NULL").all()) {
    assert.ok(row.words >= 8);
    assert.ok(row.known >= 0 && row.known <= row.words);
    assert.ok(row.rate >= 0 && row.rate <= 100);
    assert.match(row.cefr, /^B1|B2|C1|C2$/);
  }
  // 幂等：已分析的不再重复（scanned=0）
  const again = core.analyzeFeedItems({ limit: 100 });
  assert.equal(again.scanned, 0);
  // recompute：无视缓存重算全部可见条目
  const rc = core.analyzeFeedItems({ limit: 100, recompute: true });
  assert.ok(rc.scanned >= 30 && rc.analyzed >= 30);
  // 忽略条不分析
  core.user.prepare("UPDATE feed_items SET rate=NULL WHERE feed_id=? AND guid=?")
    .run(target.feed_id, target.guid);
  core.feeds.setStatus(target.feed_id, target.guid, "dismissed");
  const r3 = core.analyzeFeedItems({ limit: 100 });
  assert.equal(core.feeds.getItem(target.feed_id, target.guid).rate, null);
  assert.ok(r3.analyzed === 0);
  core.user.close();
});

test("v8 迁移：user_version 推进且重复构造可重入", async () => {
  const { core } = tmpCore(fakeFetcher({}));
  const v = core.user.prepare("PRAGMA user_version").get().user_version;
  assert.ok(v >= 8, `user_version=${v}`);
  core.user.close();
  // 同目录第二次打开（迁移再跑一遍 IF NOT EXISTS），不报错、默认源不重复
  const core2 = new Core(core.dataDir, { bundledPacks: false });
  assert.equal(core2.feeds.listFeeds().length, 3);
  core2.user.close();
});

test("接线守卫：preload 暴露全部 feeds/feed* 桥接方法且 main 有对应 handler（防 S4 feedsList is not a function 回归）", () => {
  const root = path.join(__dirname, "..");
  const preload = fs.readFileSync(path.join(root, "preload.cjs"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.cjs"), "utf8");
  const cmds = [
    "feedsList", "feedsRefresh", "feedsRefreshOne", "feedsAdd", "feedsRemove",
    "feedsToggle", "feedItems", "feedItemStatus", "feedAnalyze", "feedImport",
  ];
  for (const c of cmds) {
    assert.ok(new RegExp(`\\b${c}\\s*:`).test(preload), `preload 缺少 ${c}`);
    assert.ok(new RegExp(`\\b${c}\\s*:`).test(main), `main 缺少 ${c} handler`);
  }
});

test("defaultFetcher：非 http 协议拒绝（不触网）", async () => {
  await assert.rejects(defaultFetcher("file:///etc/passwd"), /http/);
  await assert.rejects(defaultFetcher("not a url"), /URL|http/);
});
