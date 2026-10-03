import { useEffect, useState } from "react";
import { api, type Insights, type DayTimeline } from "./api";
import { RingGauge, ErrorState, useAsync } from "./components/ui";
import { Icon } from "./icons";
import { Heatmap } from "./Heatmap";

// S10-2 仪表盘：投入区（四互斥主流分钟堆叠柱 + 动作次数）/ 能力趋势区（不可变覆盖率快照）/ 日下钻
const RANGES = [7, 30, 90] as const;
const KIND_LABEL: Record<string, string> = {
  read: "精读", shadow: "跟读", review: "复习", exam: "考试",
  lookup: "查词", note: "加入词卡", translation: "机翻段落",
};
const KIND_COLOR: Record<string, string> = {
  read: "#2f4d8a", shadow: "#b45309", review: "#1e6e3e", exam: "#9a3412",
};
const UNIT_LABEL: Record<string, string> = {
  words: "词", sentences: "句", cards: "张", times: "次", paragraphs: "段", papers: "套",
};

function Bars({ items, color }: { items: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars">
      {items.map((it, i) => (
        <div className="bar-col" key={i} title={`${it.label}：${it.value}`}>
          <div className="bar-v" style={{ height: `${(it.value / max) * 100}%`, background: color }} />
          <div className="bar-l">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

function Progress({ rate, brass }: { rate: number; brass?: boolean }) {
  return (
    <div className="prog-track">
      <div className="prog-fill" style={{ width: `${Math.min(100, rate)}%`, background: brass ? "#a16207" : "#2f4d8a" }} />
    </div>
  );
}

function StatTile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="d2-tile">
      <div className="d2-tile-v" style={tone ? { color: tone } : undefined}>{value}</div>
      <div className="d2-tile-l">{label}</div>
      {sub ? <div className="d2-tile-s">{sub}</div> : null}
    </div>
  );
}

function hhmm(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function DrillPanel({ dayKey, onClose }: { dayKey: string; onClose: () => void }) {
  const [tl, setTl] = useState<DayTimeline | null>(null);
  useEffect(() => { api.dayTimeline(dayKey).then(setTl).catch(() => setTl(null)); }, [dayKey]);
  return (
    <div className="dcard d2-drill">
      <div className="d2-drill-head">
        <h3>{dayKey} 学习明细{tl?.valid ? <span className="d2-valid-badge">有效学习日</span> : null}</h3>
        <button className="btn-mini" onClick={onClose}>关闭</button>
      </div>
      {!tl ? <p className="muted">加载中…</p> : tl.entries.length === 0 ? (
        <p className="muted">这一天没有学习记录（完整记录自 v2.16 起）</p>
      ) : (
        <ul className="d2-tl">
          {tl.entries.map((e, i) => (
            <li key={i} className="d2-tl-row">
              <span className="d2-tl-time">{e.ts ? hhmm(e.ts) : "全天"}</span>
              <span className="d2-tl-kind" style={{ background: KIND_COLOR[e.kind] || "#666" }}>
                {KIND_LABEL[e.kind] || e.kind}
              </span>
              <span className="d2-tl-title">{e.title || "—"}{e.deleted ? <em className="d2-tomb">已删除</em> : null}</span>
              <span className="d2-tl-amt">
                {e.amount != null && e.unit ? `${e.amount} ${UNIT_LABEL[e.unit] || e.unit}` : ""}
                {e.minutes ? ` · ${e.minutes} 分钟` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AbilitySection({ ins }: { ins: Insights }) {
  const pts = ins.coverage.filter((c) => c.kind === "first_annotate");
  const W = 620, H = 170, PAD = 26;
  const n = pts.length;
  const xy = (p: typeof pts[number], i: number) => ({
    x: n <= 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1),
    y: H - PAD - p.rate * (H - 2 * PAD),
  });
  const line = pts.map((p, i) => { const { x, y } = xy(p, i); return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  return (
    <div className="dcard wide">
      <h3>能力趋势 · 首读已知词覆盖率（不可变快照）</h3>
      {n === 0 ? <p className="muted">导入并精读文章后出现</p> : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="d2-svg" role="img" aria-label="首读覆盖率趋势">
            {[0.25, 0.5, 0.75, 1].map((g) => (
              <g key={g}>
                <line x1={PAD} x2={W - PAD} y1={H - PAD - g * (H - 2 * PAD)} y2={H - PAD - g * (H - 2 * PAD)} stroke="#e5e1d8" strokeWidth={1} />
                <text x={4} y={H - PAD - g * (H - 2 * PAD) + 4} fontSize={10} fill="#8a8578">{Math.round(g * 100)}%</text>
              </g>
            ))}
            {n > 1 ? <path d={line} fill="none" stroke="#a16207" strokeWidth={2} /> : null}
            {pts.map((p, i) => { const { x, y } = xy(p, i); return (
              <circle key={i} cx={x} cy={y} r={p.deleted ? 4.5 : 4} fill={p.deleted ? "#fff" : "#a16207"}
                stroke="#a16207" strokeWidth={p.deleted ? 2 : 0}>
                <title>{`${p.key} · ${p.title || "已删除文章"} · ${p.cefr || "?"} · 覆盖率 ${(p.rate * 100).toFixed(1)}%（${p.known}/${p.total}）${p.deleted ? " · 文章已删除" : ""}`}</title>
              </circle>
            ); })}
          </svg>
          <p className="muted d2-note">每篇文章首次标注时定格，之后重新标注、扩充词库都不会回改，避免「系统自己证明自己进步」。覆盖率只是理解的因素之一，主题知识同样重要。</p>
        </>
      )}
      <div className="dcard d2-placeholder">
        <h3>平行文本独立理解得分</h3>
        <p className="muted">S12 平行测评上线后出现：使用未读过的同级、同领域、同长度文本，综合理解题得分、阅读速度、中文依赖与覆盖率。投入分钟只代表努力，不代表能力。</p>
      </div>
    </div>
  );
}


// 可收缩区块：默认收起，标题行显示摘要；学习投入/热图保持展开
function FoldSection({ title, summary, children, defaultOpen = false }: {
  title: string; summary?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="d2-section">
      <button className="fold-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="fold-title">{title}</span>
        {summary && <span className="fold-summary">{summary}</span>}
        <span className="fold-chev" style={{ transform: open ? "rotate(90deg)" : "none" }}>
          <Icon name="ChevronRight" size={16} />
        </span>
      </button>
      {open && <div className="fold-body">{children}</div>}
    </section>
  );
}

export function DashPage(props: { onAssess?: () => void }) {
  const [range, setRange] = useState<number>(30);
  const [selDay, setSelDay] = useState<string | null>(null);

  // 三态收口：任一 IPC 失败都不再静默空白，而是给出可重试的错误态（#194）。
  // 测评历史是次要区块，单独失败降级为一行提示，不拖累整个仪表盘。
  const insQ = useAsync(() => api.insights(range), [range]);
  const dashQ = useAsync(() => api.dashboard(), []);
  const assessQ = useAsync(() => api.assessmentHistory(10), []);
  const ins = insQ.data;
  const dash = dashQ.data;
  const assessHist = assessQ.data ?? [];

  const days = ins?.days ?? [];
  const t = ins?.totals;
  const totalMin = t ? t.minutes.read + t.minutes.shadow + t.minutes.review + t.minutes.exam : 0;

  return (
    <div className="page">
      <div className="page-head">
        <h2>仪表盘</h2>
        <span className="muted">全部来自本地学习记录 · 学习分钟只统计精读/跟读/复习/考试四类互斥活动</span>
      </div>
      {insQ.error || dashQ.error ? (
        <ErrorState
          text={insQ.error && dashQ.error
            ? "仪表盘数据加载失败。学习记录都在本机数据库里，重试一下通常就好。"
            : insQ.error ? "学习统计加载失败。" : "仪表盘概览加载失败。"}
          onRetry={() => { insQ.reload(); dashQ.reload(); assessQ.reload(); }}
          retrying={insQ.loading || dashQ.loading}
        />
      ) : !ins || !dash ? <p className="muted">加载中…</p> : (
        <>
        {dash.backup.recovery && <div className="recovery-banner">{dash.backup.recovery}</div>}

        {/* ============ 本周投入 ============ */}
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 24, padding: "14px 24px", marginBottom: 18, flexWrap: "wrap" }}>
          {(() => {
            const vd = (ins?.days ?? []).filter((x) => x.valid).length;
            const tot = Math.max(1, (ins?.days ?? []).length || Number(range) || 7);
            return <RingGauge pct={Math.round((vd / tot) * 100)} label={`有效学习日 ${vd}/${tot}`} size={104} />;
          })()}
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", fontFamily: "Manrope, sans-serif" }}>
                🔥 {ins?.streak.current ?? 0}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>当前连胜 · 最长 {ins?.streak.longest ?? 0} 天</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", fontFamily: "Manrope, sans-serif" }}>
                {ins?.totals?.readWords ?? 0}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>精读词数（近 {range} 天）</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", fontFamily: "Manrope, sans-serif" }}>
                {ins?.totals?.reviews ?? 0}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>复习卡片</div>
            </div>
          </div>
          <div className="muted" style={{ marginLeft: "auto", fontSize: 11.5, maxWidth: 270, lineHeight: 1.7 }}>
            有效学习日：复习 ≥10 卡，或精读 ≥300 词且 ≥3 分钟，或跟读 ≥3 句，或完成 1 套卷。
          </div>
        </div>

        <section className="d2-section">
          <div className="d2-sec-head">
            <h3>学习投入</h3>
            <div className="d2-range">
              {RANGES.map((r) => (
                <button key={r} className={range === r ? "btn-mini active" : "btn-mini"} onClick={() => setRange(r)}>近 {r} 天</button>
              ))}
            </div>
          </div>
          <div className="d2-tiles">
            <StatTile label="学习分钟" value={totalMin} sub="四类主活动合计" tone="#2f4d8a" />
            <StatTile label="连续有效日" value={ins.streak.current} sub={`最长 ${ins.streak.longest} 天`} tone="#1e6e3e" />
            <StatTile label="复习卡片" value={t?.reviews ?? 0} sub={`${t?.minutes.review ?? 0} 分钟`} />
            <StatTile label="精读词数" value={t?.readWords ?? 0} sub={`${t?.minutes.read ?? 0} 分钟`} />
            <StatTile label="跟读句数" value={t?.shadowSentences ?? 0} sub={`${t?.minutes.shadow ?? 0} 分钟`} />
            <StatTile label="完成套卷" value={t?.examPapers ?? 0} sub={`${t?.minutes.exam ?? 0} 分钟`} />
          </div>

          <div className="dcard wide">
            <Heatmap days={days} range={range} selDay={selDay}
              onPick={(k) => setSelDay(selDay === k ? null : k)} />
          </div>

          <div className="d2-actions">
            <span>辅助动作（不计学习分钟）：</span>
            <b>查词 {t?.counts.lookup ?? 0}</b>
            <b>加入词卡 {t?.counts.note ?? 0}</b>
            <b>机翻段落 {t?.counts.translation ?? 0}</b>
          </div>

          {selDay ? <DrillPanel dayKey={selDay} onClose={() => setSelDay(null)} /> : null}
          <p className="muted d2-note">{ins.history_note}；有效学习日门槛：复习≥10 卡，或精读≥300 词且≥3 分钟，或跟读≥3 句，或完成 1 套卷。</p>
        </section>

        <FoldSection title="能力趋势" summary="测评得分 · 覆盖率快照 · 考纲进度">
          <div className="dcard wide assess-dash-card">
            <div className="assess-dash-head">
              <h3 style={{ margin: 0 }}>陌生同级材料独立理解得分</h3>
              <button className="btn primary" onClick={() => props.onAssess?.()}>开始能力测评</button>
            </div>
            {assessQ.error ? (
              <p className="muted">
                测评历史加载失败。
                <button className="link-btn" onClick={assessQ.reload} disabled={assessQ.loading}>
                  {assessQ.loading ? "重试中…" : "重试"}
                </button>
              </p>
            ) : assessHist.length ? (
              <div className="assess-dash-list">
                {assessHist.map((h, i) => (
                  <div key={i} className="assess-dash-row"
                    title={h.corrupt ? "这条测评的快照数据损坏，仅总分可用" : `理解 ${h.comp} · 覆盖 ${h.coverage} · 速度 ${h.speed} · 少依赖 ${h.dependence}`}>
                    <span className="badge">{h.cefr}</span>
                    <b>{h.score} 分</b>
                    {h.corrupt
                      ? <span className="muted small">快照损坏 · 详情不可用</span>
                      : <span className="muted small">{new Date(h.created_at).toLocaleDateString()} · {h.wpm} 词/分 · 对 {h.correct}/{h.questions}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">还没有测评记录。测评使用你没读过的同级文本，综合理解题、覆盖率、速度和对翻译的依赖打分；每篇只用一次，避免背题。</p>
            )}
          </div>
          <AbilitySection ins={ins} />
        </FoldSection>
        <FoldSection title="资产与诊断" summary="旧词重现率 · 查词密度 · 考纲覆盖 · 词元状态">
          <div className="dash-grid">
            <div className="dcard wide">
              <h3>旧词重现率（%·按文章）</h3>
              {dash.texts.length
                ? <Bars color="#a16207" items={dash.texts.map((x) => ({ label: (x.title || "").slice(0, 5), value: x.rate }))} />
                : <p className="muted">标注文章后出现</p>}
            </div>
            <div className="dcard wide">
              <h3>每百词查词数 · 按文章</h3>
              {dash.texts.length
                ? <Bars color="#2f4d8a" items={dash.texts.map((x) => ({ label: (x.title || "").slice(0, 5), value: x.density }))} />
                : <p className="muted">暂无</p>}
            </div>
            <div className="dcard wide">
              <h3>考纲覆盖率（已学词元 / 牌组总量）</h3>
              <div className="cov-list">
                {dash.syllabus.map((s) => (
                  <div key={s.tag} className="cov-row">
                    <span className="cov-label">{s.label}</span>
                    <Progress rate={s.rate} />
                    <span className="cov-num">{s.learned}/{s.total} · {s.rate}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="dcard">
              <h3>卡片状态</h3>
              <div className="state-row">
                <span>新卡 <b>{dash.states.new}</b></span>
                <span>学习中 <b>{dash.states.learning}</b></span>
                <span>复习中 <b>{dash.states.review}</b></span>
                <span>词元 <b>{dash.totals.lexemes}</b></span>
              </div>
              <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                本地快照：{dash.backup.count > 0 ? `已滚动保留 ${dash.backup.count} 份 · 最近 ${dash.backup.last}` : "首次启动后自动生成（每日一份，保留 7 份）"}
              </p>
            </div>
          </div>
        
        </FoldSection>
        </>
      )}
    </div>
  );
}
