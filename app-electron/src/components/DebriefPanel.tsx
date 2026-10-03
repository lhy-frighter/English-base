// S13-a-2 会话复盘面板：候选勾选 → 批量加入复习（零表单）；草稿持久化、可从今日页恢复。
import { useEffect, useState } from "react";
import { api, type DebriefCandidate, type ConversationSummaryDto } from "../api";

export interface DebriefContext {
  originKind: "reading" | "conversation" | "shadow" | "exam";
  originRef: string;
  title: string;
  sessionKey?: string;
}

const KIND_LABEL: Record<string, string> = {
  word: "词", chunk: "表达", grammar: "语法", pronunciation: "发音", concept: "概念",
};

export function DebriefPanel({ ctx, initial, onClose, onAfter }: {
  ctx: DebriefContext;
  initial: DebriefCandidate[];
  onClose: () => void;
  onAfter?: () => void;
}) {
  const [cands, setCands] = useState<DebriefCandidate[]>(initial);
  const [picked, setPicked] = useState<Set<number>>(new Set(initial.map((_, i) => i)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [summary, setSummary] = useState<ConversationSummaryDto | null>(null);

  useEffect(() => {
    if (ctx.sessionKey) {
      api.conversationSummary(ctx.sessionKey).then(setSummary).catch((e) => { console.error("[debrief] 会话摘要加载失败", e); });
    }
  }, [ctx.sessionKey]);

  // 候选变化即持久化草稿（崩溃/跳转不丢）
  useEffect(() => {
    api.debriefPut({
      origin_kind: ctx.originKind, origin_ref: ctx.originRef, candidates: cands,
    }).catch((e) => { console.error("[debrief] 草稿持久化失败", e); });
  }, [cands, ctx.originKind, ctx.originRef]);

  const toggle = (i: number) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });

  const removeCand = (i: number) => {
    setCands((cs) => cs.filter((_, k) => k !== i));
    setPicked((prev) => {
      const n = new Set<number>();
      prev.forEach((k) => { if (k < i) n.add(k); else if (k > i) n.add(k - 1); });
      return n;
    });
  };

  const confirm = async () => {
    setBusy(true); setMsg("");
    let created = 0, skipped = 0;
    try {
      for (let i = 0; i < cands.length; i++) {
        if (!picked.has(i)) { skipped++; continue; }
        const c = cands[i];
        if (c.kind === "word") {
          const sent = c.sentence?.trim();
          const r = sent
            ? await api.createNote({
                word: c.clicked || c.canonical, label: "word", phrase: null,
                sense: c.gloss ?? "", textId: Number(ctx.originRef) || 0, offset: 0,
              })
            : await api.createStandaloneNote({
                word: c.canonical, label: "word", phrase: null, sense: c.gloss ?? "",
              });
          created += r.cards_created || 0;
        } else {
          const r = await api.captureAsset({
            asset_kind: c.kind, canonical: c.canonical, gloss: c.gloss ?? "",
            payload: c.payload || {}, test_point: "",
            idempotency_key: `debrief-${ctx.originKind}-${ctx.originRef}-${c.kind}-${i}`,
            encounter: {
              origin_kind: (ctx.originKind === "reading" ? "reading" : ctx.originKind === "exam" ? "exam" : "conversation") as never,
              origin_ref: ctx.originRef, title: ctx.title, sentence: c.sentence ?? "",
            },
          });
          created += r.cards_created;
        }
      }
      await api.debriefSetStatus(ctx.originKind + ":" + ctx.originRef, "done");
      setMsg(`已加入复习：${created} 张卡${skipped ? ` · 跳过 ${skipped} 项` : ""}`);
      onAfter?.();
      setTimeout(onClose, 1000);
    } catch (e) {
      setMsg("处理失败：" + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const skipAll = async () => {
    try {
      await api.debriefSetStatus(ctx.originKind + ":" + ctx.originRef, "skipped");
    } catch { /* ignore */ }
    onAfter?.(); onClose();
  };

  return (
    <div className="db-overlay" onClick={onClose}>
      <div className="db-sheet" onClick={(e) => e.stopPropagation()}>
        <style>{`
          .db-overlay{position:fixed;inset:0;background:rgba(20,26,38,.42);z-index:90;display:flex;align-items:center;justify-content:center;padding:24px}
          .db-sheet{background:var(--card,#fff);border-radius:16px;max-width:680px;width:100%;max-height:86vh;overflow:auto;padding:20px 22px;box-shadow:0 18px 60px rgba(20,26,38,.28)}
          .db-head{display:flex;align-items:baseline;gap:10px;margin-bottom:4px}
          .db-head h3{margin:0;font-size:18px}
          .db-sub{font-size:12px;color:var(--ink-3)}
          .db-summary{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px}
          .db-summary span{font-size:12px;background:#f2f4f8;border-radius:20px;padding:3px 11px;color:var(--ink-2)}
          .db-list{margin:12px 0;display:flex;flex-direction:column;gap:8px}
          .db-item{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line,#e6e9ef);border-radius:10px;padding:9px 12px}
          .db-item.sel{border-color:#8fbfa4;background:#f4faf6}
          .db-check{margin-top:3px}
          .db-kind{font-size:11px;background:#eef1f6;color:var(--ink-2);border-radius:6px;padding:1px 7px;white-space:nowrap}
          .db-main{min-width:0;flex:1}
          .db-canon{font-size:15px;font-weight:600}
          .db-gloss{font-size:13px;color:var(--ink-3);margin-top:1px}
          .db-x{border:0;background:transparent;color:var(--ink-3);cursor:pointer;font-size:16px;line-height:1}
          .db-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
          .db-msg{font-size:13px;margin-top:10px;color:#1d6b46}
        `}</style>
        <div className="db-head">
          <h3>本次复盘 · {ctx.title}</h3>
          <span className="db-sub">{cands.length} 项候选，勾选后批量加入复习</span>
          <button className="db-x" style={{ marginLeft: "auto" }} onClick={onClose}>×</button>
        </div>

        {summary && (
          <div className="db-summary">
            <span>本场沉淀 {summary.assets} 项资产</span>
            <span>自然用出 {summary.evidence.used_spontaneously}</span>
            <span>引导用出 {summary.evidence.used_prompted}</span>
            <span>纠正后用出 {summary.evidence.used_after_correction}</span>
          </div>
        )}

        <div className="db-list">
          {cands.map((c, i) => (
            <label key={i} className={"db-item" + (picked.has(i) ? " sel" : "")}>
              <input className="db-check" type="checkbox" checked={picked.has(i)}
                onChange={() => toggle(i)} />
              <span className="db-kind">{KIND_LABEL[c.kind] || c.kind}</span>
              <span className="db-main">
                <div className="db-canon">{c.canonical}</div>
                {c.gloss && <div className="db-gloss">{c.gloss}</div>}
              </span>
              <button type="button" className="db-x" title="移除候选"
                onClick={(e) => { e.preventDefault(); removeCand(i); }}>×</button>
            </label>
          ))}
          {cands.length === 0 && <div className="db-sub">没有候选项目</div>}
        </div>

        <div className="db-actions">
          <button className="primary" disabled={busy || cands.length === 0} onClick={confirm}>
            {busy ? "处理中…" : "✓ 批量加入复习"}
          </button>
          <button className="ghost2" disabled={busy} onClick={skipAll}>本次跳过</button>
        </div>
        {msg && <div className="db-msg">{msg}</div>}
      </div>
    </div>
  );
}
