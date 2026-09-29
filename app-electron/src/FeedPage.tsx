import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { api, type FeedItem, type FeedSource } from "./api";
import { confirmDialog } from "./components/ui";

// 每日好文：RSS 源管理 + 按用户已学词覆盖率做 i+1 推荐 + 一键抓正文加入精读
type Fit = "i1" | "easy" | "stretch" | "hard" | "none";
const FIT_LABEL: Record<Fit, string> = {
  i1: "刚好适合", easy: "偏易", stretch: "可挑战", hard: "偏难", none: "未评估",
};
function fitOf(it: FeedItem): Fit {
  if (it.rate == null) return "none";
  if (it.rate >= 98) return "easy";
  if (it.rate >= 93) return "i1";
  if (it.rate >= 88) return "stretch";
  return "hard";
}
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  const eq = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (eq(d, today)) return "今天";
  if (eq(d, yest)) return "昨天";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hostOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}
function syncTime(ts: number): string {
  if (!ts) return "从未同步";
  const h = (Date.now() - ts) / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} 分钟前同步`;
  if (h < 24) return `${Math.round(h)} 小时前同步`;
  return `${Math.round(h / 24)} 天前同步`;
}

export default function FeedPage({ onImported }: { onImported: (textId: number) => void }) {
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<string>(""); // feed_id|guid
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [showSrc, setShowSrc] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const load = useCallback(async () => {
    const [fs, it] = await Promise.all([
      api.feedsList(),
      api.feedItems({ status: "all", limit: 100 }),
    ]);
    setFeeds(fs);
    setItems(it.items);
  }, []);

  const initial = useCallback(async () => {
    setErr("");
    try {
      await load();
      const a = await api.feedAnalyze({ limit: 100, recompute: true });
      if (a.analyzed) await load();
    } catch (e) { setErr(String(e && (e as Error).message ? (e as Error).message : e)); }
  }, [load]);
  useEffect(() => { initial(); }, [initial]);

  const refresh = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await api.feedsRefresh({ force: true });
      const a = await api.feedAnalyze({ limit: 100, recompute: true });
      await load();
      setMsg(`同步完成：新增 ${r.added} 篇${a.analyzed ? `，评估 ${a.analyzed} 篇` : ""}`);
    } catch (e) { setErr(String(e && (e as Error).message ? (e as Error).message : e)); }
    finally { setBusy(false); }
  };

  const addSource = async () => {
    const url = newUrl.trim();
    if (!url) return;
    setAddBusy(true); setErr("");
    try {
      const r = await api.feedsAdd({ url });
      if (r.ok === false) throw new Error(r.error || "该地址拉取失败，已保留在源列表，可检查后删除");
      setNewUrl(""); await load();
      await api.feedAnalyze({ limit: 100, recompute: true }); await load();
      setMsg("源已添加");
    } catch (e) { setErr(String(e && (e as Error).message ? (e as Error).message : e)); }
    finally { setAddBusy(false); }
  };

  const toggle = async (f: FeedSource) => {
    await api.feedsToggle({ id: f.id, enabled: !f.enabled });
    await load();
  };
  const remove = async (f: FeedSource) => {
    const ok = await confirmDialog(f.builtin
      ? { title: `停用内置源「${f.title}」？`, body: "停用后可随时重新启用。", okLabel: "停用", cancelLabel: "取消" }
      : { title: `删除源「${f.title}」？`, body: "其全部条目一并删除。", danger: true, okLabel: "删除", cancelLabel: "取消" });
    if (!ok) return;
    await api.feedsRemove({ id: f.id });
    await load();
  };

  const doImport = async (it: FeedItem) => {
    if (it.status === "imported" && it.text_id) { onImported(it.text_id); return; }
    const key = `${it.feed_id}|${it.guid}`;
    setImporting(key); setErr("");
    try {
      const r = await api.feedImport({ feedId: it.feed_id, guid: it.guid });
      await load();
      onImported(r.textId);
    } catch (e) { setErr(String(e && (e as Error).message ? (e as Error).message : e)); }
    finally { setImporting(""); }
  };
  const dismiss = async (it: FeedItem) => {
    await api.feedItemStatus({ feedId: it.feed_id, guid: it.guid, status: "dismissed" });
    await load();
  };

  // 排序：i+1 推荐优先，其次发布时间；已导入/忽略沉底
  const visible = useMemo(() => {
    const list = items.filter((i) => showDismissed ? true : i.status !== "dismissed");
    const rank: Record<Fit, number> = { i1: 0, stretch: 1, hard: 2, easy: 3, none: 4 };
    return [...list].sort((a, b) => {
      if ((a.status === "imported") !== (b.status === "imported")) return a.status === "imported" ? 1 : -1;
      if (a.status === "dismissed" || b.status === "dismissed") return a.status === "dismissed" ? 1 : -1;
      const fa = fitOf(a); const fb = fitOf(b);
      if (rank[fa] !== rank[fb]) return rank[fa] - rank[fb];
      return b.published_at - a.published_at;
    });
  }, [items, showDismissed]);

  const groups = useMemo(() => {
    const m = new Map<string, FeedItem[]>();
    for (const it of visible) {
      const k = dayLabel(it.published_at || it.fetched_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return [...m.entries()];
  }, [visible]);

  const enabledN = feeds.filter((f) => f.enabled).length;
  const i1n = items.filter((i) => i.status !== "dismissed" && fitOf(i) === "i1").length;

  return (
    <div className="page feed-page">
      <div className="page-head">
        <h2>每日好文</h2>
        <span className="muted">按你的已学词覆盖率排序 · 覆盖率 93–98% 为最佳学习区间（稍有挑战、基本能读懂）</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="gbtn" title={`同步最新（${enabledN} 个源启用）`} onClick={refresh} disabled={busy} aria-label="同步最新">
            <Icon name={busy ? "Sparkles" : "Rocket"} size={18} />
          </button>
          <button className="gbtn" title={`源管理 · ${enabledN} 个启用`} onClick={() => setShowSrc((v) => !v)} aria-label="源管理">
            <Icon name="Settings" size={18} />
          </button>
        </span>
      </div>
      {err && <div className="err">{err}</div>}
      {msg && <div className="ok-msg">{msg}</div>}

      {showSrc && (
        <div className="feed-sources">
          {feeds.map((f) => (
            <div className={"feed-src-row" + (f.enabled ? "" : " off")} key={f.id}>
              <label className="feed-src-name">
                <input type="checkbox" checked={f.enabled} onChange={() => toggle(f)} />
                <span>{f.title}{f.builtin && <em className="src-tag">内置</em>}</span>
              </label>
              <span className="muted feed-src-url">{hostOf(f.url)}</span>
              <span className={"feed-src-state" + (f.last_error ? " bad" : "")}>
                {f.enabled ? (f.last_error ? `错误：${f.last_error}` : syncTime(f.last_sync)) : "已停用"}
              </span>
              <button className="ghost2 small" onClick={() => remove(f)}>{f.builtin ? "停用" : "删除"}</button>
            </div>
          ))}
          <div className="feed-add">
            <input
              value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
              placeholder="粘贴 RSS/Atom 地址（http/https），添加后立即试拉"
              onKeyDown={(e) => { if (e.key === "Enter") addSource(); }}
            />
            <button onClick={addSource} disabled={addBusy || !newUrl.trim()}>{addBusy ? "添加中…" : "添加源"}</button>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="feed-empty">
          还没有推荐文章。点右上角「同步最新」从启用的源拉取标题与摘要；
           Sixth Tone 等无公开 RSS 的站点可在「源管理」里换用其 RSS 地址。
        </div>
      )}
      {i1n > 0 && <div className="feed-i1line">今天有 <b>{i1n}</b> 篇落在你的最佳学习区间，优先读这些。</div>}

      {groups.map(([day, list]) => (
        <div className="feed-day" key={day}>
          <div className="feed-day-head">{day}</div>
          {list.map((it) => {
            const fit = fitOf(it);
            const key = `${it.feed_id}|${it.guid}`;
            return (
              <div className={"feed-card" + (it.status === "imported" ? " imported" : "") + (it.status === "dismissed" ? " dismissed" : "")} key={key}>
                <div className="feed-card-top">
                  <span className="feed-src-badge">{it.feed_title}</span>
                  <span className="feed-date">{dayLabel(it.published_at || it.fetched_at)} · {hostOf(it.link)}</span>
                </div>
                <div className="feed-title">{it.title}</div>
                {it.summary && <div className="feed-summary">{it.summary}</div>}
                <div className="feed-card-bottom">
                  <span className={"fit-badge fit-" + fit}>{FIT_LABEL[fit]}</span>
                  {it.rate != null && (
                    <span className="feed-metrics">
                      已知词覆盖率 <b>{it.rate.toFixed(1)}%</b>
                      {it.cefr && <> · 文本难度 <b>{it.cefr}</b></>}
                      {it.words != null && <> · 摘要 {it.words} 词</>}
                    </span>
                  )}
                  <span className="feed-actions">
                    {it.status === "imported" ? (
                      <button className="primary small" onClick={() => it.text_id && onImported(it.text_id)}>在书库中打开（#{it.text_id}）</button>
                    ) : it.status === "dismissed" ? (
                      <button className="ghost2 small" disabled>已忽略</button>
                    ) : (
                      <>
                        <button className="primary small" disabled={importing === key} onClick={() => doImport(it)}>
                          {importing === key ? "抓取正文中…" : "加入精读"}
                        </button>
                        <button className="ghost2 small" disabled={importing === key} onClick={() => dismiss(it)}>忽略</button>
                      </>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="feed-foot">
        <button className="ghost2 small" onClick={() => setShowDismissed((v) => !v)}>
          {showDismissed ? "隐藏已忽略" : "查看已忽略"}
        </button>
        <span className="muted">覆盖率基于摘要估算，加入精读后以全文统计为准；评估只在本地运行，不上传阅读记录。</span>
      </div>
    </div>
  );
}
