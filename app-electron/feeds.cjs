// feeds.cjs — S3「每日好文」RSS/Atom 同步地基（零依赖、可注入 fetcher 离线测试）
// 职责：源注册表（可增删/启停）→ 拉取（Node fetch，仅 http/https，5MB 上限）→
//       零依赖 RSS2.0/Atom 解析 → feed_items 落库（guid 去重、状态机、覆盖率缓存留给 S4）。
const { decodeEntities } = require("./import-tools.cjs");

const FEED_STALE_MS = 6 * 60 * 60 * 1000; // 启动/手动刷新的过期阈值 6h
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20000;
const SUMMARY_LIMIT = 600;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EnglishBase/0.1 (local-first RSS reader)";

// v8 迁移：RSS 源与条目（幂等，IF NOT EXISTS；版本推进由 core.migrate 包在同一事务）
const MIGRATION_V8 = `
CREATE TABLE IF NOT EXISTS feeds(
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  builtin INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_sync INTEGER NOT NULL DEFAULT 0,
  etag TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS feed_items(
  feed_id TEXT NOT NULL,
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  published_at INTEGER NOT NULL DEFAULT 0,
  fetched_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  words INTEGER,
  known INTEGER,
  rate REAL,
  cefr TEXT NOT NULL DEFAULT '',
  text_id INTEGER,
  PRIMARY KEY(feed_id, guid));
CREATE INDEX IF NOT EXISTS idx_feed_items_pub ON feed_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_status ON feed_items(status, published_at DESC);
`;

// 广州真机实测可达（2026-09-16，Node fetch）：feed 可达 + 当日更新 + 正文可抽取。
// 分级新闻/思想随笔/科学新闻三档；Sixth Tone 无公开 RSS，Guardian/BBC/VOA 官网被墙，
// 旧内置 builtin-voa-le 的 feedburner 条目指向不可达的 blogspot 归档，已退役。
// 用户挂代理后可自行「添加源」。
const DEFAULT_FEEDS = [
  { id: "builtin-newsinlevels", title: "News in Levels（分级新闻 B1）", url: "https://www.newsinlevels.com/feed/" },
  { id: "builtin-aeon", title: "Aeon 思想随笔（C1）", url: "https://aeon.co/feed.rss" },
  { id: "builtin-sciencedaily", title: "ScienceDaily 科学新闻（B2-C1）", url: "https://www.sciencedaily.com/rss/all.xml" },
];

// ---------- 纯解析函数（无网络、无 DB，单测直接打） ----------

function cdataOrText(inner) {
  if (inner == null) return "";
  const m = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : inner;
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? cdataOrText(m[1]).trim() : "";
}

function stripHtml(s, limit = SUMMARY_LIMIT) {
  const out = decodeEntities(
    String(s || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/(p|div|li|h[1-6]|br|blockquote)>/gi, " ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
  return out.length > limit ? out.slice(0, limit) + "…" : out;
}

function parseDate(s) {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

// feed 形态守卫：defaultFetcher 拉到后先过这道闸（也供单测直接打）
function ensureFeedXml(xml) {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(String(xml || "").replace(/^﻿/, "").slice(0, 4000))) {
    throw new Error("不是 RSS/Atom feed");
  }
  return xml;
}

// RSS 2.0 <item>；Atom <entry>。返回 {title, items[]}
function parseFeed(xml, baseUrl = "") {
  const text = String(xml || "").replace(/^﻿/, "");
  const isAtom = /<feed[\s>]/i.test(text) && !/<rss[\s>]/i.test(text);
  const feedTitle = stripHtml(cdataOrText((text.match(/<(?:channel|feed)[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1]), 200);
  const items = [];

  if (isAtom) {
    const entries = text.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const block of entries) {
      const title = stripHtml(tag(block, "title"), 300);
      // link：优先 rel=alternate，否则第一个带 href 的
      let link = "";
      const alt = block.match(/<link[^>]*rel=["']?alternate["']?[^>]*href=["']([^"']+)["']/i)
        || block.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']?alternate["']?/i);
      if (alt) link = alt[1];
      if (!link) {
        const any = block.match(/<link[^>]*href=["']([^"']+)["']/i);
        if (any) link = any[1];
      }
      if (baseUrl && link && !/^https?:/i.test(link)) {
        try { link = new URL(link, baseUrl).href; } catch { /* 保留原相对串 */ }
      }
      const guid = tag(block, "id") || link;
      const summary = stripHtml(tag(block, "summary") || tag(block, "content") || "");
      const author = stripHtml((block.match(/<author[^>]*>([\s\S]*?)<\/author>/i) || [, ""])[1].replace(/<[^>]+>/g, " "), 120);
      const published = parseDate(tag(block, "published") || tag(block, "updated"));
      if (title && guid) items.push({ guid, title, link, summary, author, publishedAt: published });
    }
  } else {
    const blocks = text.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    for (const block of blocks) {
      const title = stripHtml(tag(block, "title"), 300);
      let link = tag(block, "link");
      if (!link) {
        const m = block.match(/<link[^>]*href=["']([^"']+)["']/i); // 少见的 Atom 风格 link
        if (m) link = m[1];
      }
      const guid = tag(block, "guid") || link;
      const desc = tag(block, "content:encoded") || tag(block, "description") || tag(block, "summary");
      const author = stripHtml(tag(block, "author") || tag(block, "dc:creator"), 120);
      const published = parseDate(tag(block, "pubDate") || tag(block, "published") || tag(block, "dc:date"));
      if (title && guid) items.push({ guid, title, link: link.trim(), summary: stripHtml(desc), author, publishedAt: published });
    }
  }
  return { title: feedTitle, items };
}

// ---------- 网络 ----------

async function defaultFetcher(url, { etag = "" } = {}) {
  let u;
  try { u = new URL(url); } catch { throw new Error("URL 不合法"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("仅支持 http/https");
  const headers = { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8" };
  if (etag) headers["If-None-Match"] = etag;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(u.href, { headers, redirect: "follow", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 304) return { notModified: true, etag: res.headers.get("etag") || etag };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_FEED_BYTES) throw new Error("feed 超过 5MB 上限");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_FEED_BYTES) throw new Error("feed 超过 5MB 上限");
  const xml = ensureFeedXml(buf.toString("utf8").replace(/^﻿/, ""));
  return { xml, etag: res.headers.get("etag") || etag || "", notModified: false };
}

// ---------- 仓库 ----------

class FeedManager {
  constructor(db, opts = {}) {
    this.db = db;
    this.fetcher = opts.fetcher || defaultFetcher;
    this.now = opts.now || (() => Date.now());
  }

  seed() {
    const t = this.now();
    const ins = this.db.prepare("INSERT OR IGNORE INTO feeds(id,title,url,builtin,enabled,created_at) VALUES(?,?,?,1,1,?)");
    for (const f of DEFAULT_FEEDS) ins.run(f.id, f.title, f.url, t);
    // 退役内置源：已不在 DEFAULT_FEEDS 的 builtin 行物理删除（条目级联）。
    // 用户停用决定只对仍存在的内置源有意义，故退役不保留墓碑。
    const keep = DEFAULT_FEEDS.map((f) => f.id);
    const placeholders = keep.map(() => "?").join(",");
    const old = this.db.prepare(`SELECT id FROM feeds WHERE builtin=1 AND id NOT IN (${placeholders})`).all(...keep);
    if (old.length) {
      const delItems = this.db.prepare("DELETE FROM feed_items WHERE feed_id=?");
      const del = this.db.prepare("DELETE FROM feeds WHERE id=? AND builtin=1");
      for (const r of old) { delItems.run(r.id); del.run(r.id); }
    }
  }

  listFeeds() {
    return this.db.prepare("SELECT id,title,url,builtin,enabled,last_sync,etag,last_error FROM feeds ORDER BY builtin DESC, created_at, id").all()
      .map((r) => ({ ...r, builtin: !!r.builtin, enabled: !!r.enabled }));
  }

  // 内置源删除=停用（可再启用）；用户源=物理删除（连同条目）
  removeFeed(id) {
    const f = this.db.prepare("SELECT builtin FROM feeds WHERE id=?").get(id);
    if (!f) return { removed: false };
    this.db.exec("BEGIN");
    try {
      if (f.builtin) this.db.prepare("UPDATE feeds SET enabled=0 WHERE id=?").run(id);
      else { this.db.prepare("DELETE FROM feed_items WHERE feed_id=?").run(id); this.db.prepare("DELETE FROM feeds WHERE id=?").run(id); }
      this.db.exec("COMMIT");
    } catch (e) { try { this.db.exec("ROLLBACK"); } catch { /* ignore */ } throw e; }
    return { removed: true, builtin: !!f.builtin };
  }

  toggleFeed(id, enabled) {
    const r = this.db.prepare("UPDATE feeds SET enabled=? WHERE id=?").run(enabled ? 1 : 0, id);
    return { changed: r.changes > 0 };
  }

  // 添加后立即试拉一次；拉取失败也保留源（记录 last_error），方便用户看到错误后删除/修 URL
  async addFeed(url, title = "") {
    const u = url.trim();
    let parsed;
    try { parsed = new URL(u); } catch { throw new Error("URL 不合法"); }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("仅支持 http/https");
    const dup = this.db.prepare("SELECT id,enabled FROM feeds WHERE url=?").get(u);
    if (dup) {
      if (!dup.enabled) this.db.prepare("UPDATE feeds SET enabled=1,last_error='' WHERE id=?").run(dup.id);
      return { id: dup.id, reused: true };
    }
    const id = "user-" + this.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    this.db.prepare("INSERT INTO feeds(id,title,url,builtin,enabled,created_at) VALUES(?,?,?,0,1,?)")
      .run(id, title || u, u, this.now());
    const r = await this.refreshFeed(id, { force: true });
    const row = this.db.prepare("SELECT title FROM feeds WHERE id=?").get(id);
    if (!title && r.feedTitle) this.db.prepare("UPDATE feeds SET title=? WHERE id=?").run(r.feedTitle.slice(0, 120), id);
    return { id, reused: false, ...r, title: row?.title || title || u };
  }

  async refreshFeed(id, { force = false } = {}) {
    const f = this.db.prepare("SELECT * FROM feeds WHERE id=?").get(id);
    if (!f) throw new Error("源不存在");
    if (!f.enabled) return { id, skipped: true, reason: "disabled" };
    if (!force && f.last_sync && this.now() - f.last_sync < FEED_STALE_MS && !f.last_error) {
      return { id, skipped: true, reason: "fresh" };
    }
    let payload;
    try {
      payload = await this.fetcher(f.url, { etag: f.etag || "" });
    } catch (e) {
      this.db.prepare("UPDATE feeds SET last_sync=?,last_error=? WHERE id=?").run(this.now(), String(e.message || e), id);
      return { id, ok: false, error: String(e.message || e) };
    }
    if (payload.notModified) {
      this.db.prepare("UPDATE feeds SET last_sync=?,last_error='' WHERE id=?").run(this.now(), id);
      return { id, notModified: true };
    }
    const parsed = parseFeed(payload.xml, f.url);
    const t = this.now();
    const sel = this.db.prepare("SELECT 1 x FROM feed_items WHERE feed_id=? AND guid=?");
    const ins = this.db.prepare(`INSERT INTO feed_items(feed_id,guid,title,link,summary,author,published_at,fetched_at,status)
      VALUES(?,?,?,?,?,?,?,?,'new')`);
    const upd = this.db.prepare(`UPDATE feed_items SET title=?,link=?,summary=?,author=?,published_at=? WHERE feed_id=? AND guid=?`);
    let added = 0, updated = 0;
    this.db.exec("BEGIN");
    try {
      for (const it of parsed.items) {
        if (sel.get(id, it.guid)) { upd.run(it.title, it.link, it.summary, it.author, it.publishedAt, id, it.guid); updated++; }
        else { ins.run(id, it.guid, it.title, it.link || "", it.summary, it.author, it.publishedAt, t); added++; }
      }
      this.db.prepare("UPDATE feeds SET last_sync=?,etag=?,last_error='' WHERE id=?").run(t, payload.etag || "", id);
      this.db.exec("COMMIT");
    } catch (e) {
      try { this.db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw e;
    }
    return { id, ok: true, added, updated, total: parsed.items.length, feedTitle: parsed.title };
  }

  async refreshAll({ force = false } = {}) {
    const feeds = this.db.prepare("SELECT id FROM feeds WHERE enabled=1").all();
    const results = [];
    for (const f of feeds) results.push(await this.refreshFeed(f.id, { force }));
    const added = results.reduce((n, r) => n + (r.added || 0), 0);
    return { results, added, at: this.now() };
  }

  // status: new=未处理 / imported=已加入精读（带 text_id）/ dismissed=忽略
  setStatus(feedId, guid, status, textId = null) {
    const r = this.db.prepare("UPDATE feed_items SET status=?, text_id=COALESCE(?,text_id) WHERE feed_id=? AND guid=?")
      .run(status, textId, feedId, guid);
    return { changed: r.changes > 0 };
  }

  getItem(feedId, guid) {
    return this.db.prepare("SELECT * FROM feed_items WHERE feed_id=? AND guid=?").get(feedId, guid) || null;
  }

  // S4 写覆盖率缓存
  setAnalysis(feedId, guid, a) {    const r = this.db.prepare("UPDATE feed_items SET words=?,known=?,rate=?,cefr=? WHERE feed_id=? AND guid=?")
      .run(a.words ?? null, a.known ?? null, a.rate ?? null, a.cefr || "", feedId, guid);
    return { changed: r.changes > 0 };
  }

  listItems({ status = "visible", limit = 60, offset = 0 } = {}) {
    const cond = status === "all" ? "" : status === "visible" ? "WHERE i.status!='dismissed'" : "WHERE i.status=?";
    const args = status === "visible" || status === "all" ? [] : [status];
    const rows = this.db.prepare(
      `SELECT i.*, f.title AS feed_title FROM feed_items i JOIN feeds f ON f.id=i.feed_id
       ${cond} ORDER BY i.published_at DESC, i.fetched_at DESC LIMIT ? OFFSET ?`,
    ).all(...args, limit, offset);
    const total = this.db.prepare(`SELECT COUNT(*) n FROM feed_items i ${cond}`).get(...args).n;
    return { total, items: rows };
  }
}

module.exports = {
  MIGRATION_V8, FeedManager, parseFeed, stripHtml, defaultFetcher, ensureFeedXml,
  FEED_STALE_MS, MAX_FEED_BYTES, DEFAULT_FEEDS,
};
