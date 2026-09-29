// S15-1 语法深度诊断面板（内联挂在触发的气泡/题卡下）：
// 错误勾选 → 批量生成 grammar 资产；rewritten/native_tip 可选作 chunk 入库。
// 诊断只产生候选；不写能力证据（能力证据来自后续实际用出/复习）。
import { useState } from "react";
import { api, type AssetOriginKind } from "../api";
import type { GrammarAnalysis, GrammarError } from "../conversation/grammar-engine";

export interface GrammarPanelSource {
  originKind: AssetOriginKind;
  originRef: string;
  title: string;
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const TYPE_LABEL: Record<string, string> = {
  tense: "时态", agreement: "主谓一致", article: "冠词", preposition: "介词",
  word_order: "语序", collocation: "搭配", mood: "语气", other: "其他",
};

export function GrammarDiagnosisPanel({ source, text, analysis, onClose }: {
  source: GrammarPanelSource;
  text: string;
  analysis: GrammarAnalysis;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<number>>(
    new Set(analysis.errors.map((_, i) => i)),
  );
  const [saveRewritten, setSaveRewritten] = useState(false);
  const [saveNative, setSaveNative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  const toggle = (i: number) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });

  const encounter = (quote: string) => ({
    origin_kind: source.originKind,
    origin_ref: source.originRef,
    title: source.title,
    sentence: text,
    locator: { via: "grammar-panel", quote },
  });

  const captureGrammar = async (e: GrammarError) =>
    api.captureAsset({
      asset_kind: "grammar",
      canonical: `${e.quote} → ${e.correct}`,
      gloss: e.rule_zh,
      payload: {
        exercise_form: "error_spotting",
        prompt: text,
        answer: analysis.rewritten || e.correct,
        explanation: e.rule_zh,
        counterexample: e.quote,
      },
      idempotency_key:
        `ui-${source.originKind}-${source.originRef}-grammar-${fnv(e.quote + "|" + e.correct)}`,
      encounter: encounter(e.quote),
    });

  const captureChunk = async (canonical: string, tag: string) =>
    api.captureAsset({
      asset_kind: "chunk",
      canonical,
      gloss: "",
      payload: { register: "written", example_en: text, zh_intent: "" },
      idempotency_key:
        `ui-${source.originKind}-${source.originRef}-chunk-${tag}-${fnv(canonical)}`,
      encounter: encounter(canonical.slice(0, 60)),
    });

  const confirm = async () => {
    setBusy(true); setMsg("");
    let cards = 0, items = 0;
    try {
      for (let i = 0; i < analysis.errors.length; i++) {
        if (!picked.has(i)) continue;
        const r = await captureGrammar(analysis.errors[i]);
        cards += r.cards_created; items += 1;
      }
      if (saveRewritten && analysis.rewritten) {
        const r = await captureChunk(analysis.rewritten, "rw");
        cards += r.cards_created; items += 1;
      }
      if (saveNative && analysis.native_tip) {
        const r = await captureChunk(analysis.native_tip, "nt");
        cards += r.cards_created; items += 1;
      }
      setDone(true);
      setMsg(`已加入复习：${items} 项、${cards} 张卡`);
      setTimeout(onClose, 1200);
    } catch (e) {
      setMsg("处理失败：" + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gp-panel">
      <style>{`
        .gp-panel{border:1px solid var(--line,#e6e9ef);border-radius:12px;background:var(--card,#fff);padding:12px 14px;margin:8px 0;box-shadow:0 4px 14px rgba(20,26,38,.06)}
        .gp-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
        .gp-head h4{margin:0;font-size:14px}
        .gp-score{font-size:12px;border-radius:20px;padding:2px 10px;background:#eef3f0;color:#2c6e49}
        .gp-x{margin-left:auto;border:0;background:transparent;color:var(--ink-3);cursor:pointer;font-size:15px;line-height:1}
        .gp-ok{font-size:13px;color:#2c6e49;background:#f2f8f4;border-radius:8px;padding:7px 10px;margin-bottom:6px}
        .gp-list{display:flex;flex-direction:column;gap:7px;margin:6px 0}
        .gp-row{display:flex;gap:9px;align-items:flex-start;border:1px solid var(--line,#e6e9ef);border-radius:9px;padding:8px 10px}
        .gp-row.sel{border-color:#8fbfa4;background:#f6faf7}
        .gp-check{margin-top:3px}
        .gp-tag{font-size:10px;background:#eef1f6;color:var(--ink-2);border-radius:6px;padding:1px 6px;white-space:nowrap}
        .gp-tag.warn{background:#fbf1e2;color:#9a6216}
        .gp-body{min-width:0;flex:1}
        .gp-fix{font-size:14px;line-height:1.5}
        .gp-fix .bad{text-decoration:line-through;color:#b4453a}
        .gp-fix .arrow{margin:0 6px;color:var(--ink-3)}
        .gp-fix .good{color:#2c6e49;font-weight:600}
        .gp-rule{font-size:12px;color:var(--ink-3);margin-top:2px}
        .gp-alt{display:flex;gap:9px;align-items:flex-start;border:1px dashed var(--line,#d9dee8);border-radius:9px;padding:8px 10px;margin-top:7px}
        .gp-alt-label{font-size:11px;color:var(--ink-3);white-space:nowrap;margin-top:2px}
        .gp-alt-text{font-size:13px;line-height:1.5;flex:1;min-width:0}
        .gp-actions{display:flex;gap:10px;margin-top:11px;align-items:center}
        .gp-msg{font-size:12px;color:#2c6e49}
      `}</style>

      <div className="gp-head">
        <h4>语法深度分析</h4>
        <span className="gp-score">估计 {analysis.score_est}/100</span>
        <button className="gp-x" onClick={onClose} aria-label="关闭">×</button>
      </div>

      {analysis.errors.length === 0 && (
        <div className="gp-ok">未发现语法错误{analysis.dropped ? `（${analysis.dropped} 条无法定位原文，已丢弃）` : ""}</div>
      )}

      {analysis.errors.length > 0 && (
        <div className="gp-list">
          {analysis.errors.map((e, i) => (
            <label key={i} className={"gp-row" + (picked.has(i) ? " sel" : "")}>
              <input className="gp-check" type="checkbox" checked={picked.has(i)}
                onChange={() => toggle(i)} />
              <span className={"gp-tag" + (e.severity === "warning" ? " warn" : "")}>
                {TYPE_LABEL[e.type] || e.type}
              </span>
              <span className="gp-body">
                <span className="gp-fix">
                  <span className="bad">{e.quote}</span>
                  <span className="arrow">→</span>
                  <span className="good">{e.correct}</span>
                </span>
                <span className="gp-rule">{e.rule_zh}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      {analysis.rewritten && analysis.rewritten !== text && (
        <label className="gp-alt">
          <input type="checkbox" checked={saveRewritten}
            onChange={(e) => setSaveRewritten(e.target.checked)} />
          <span className="gp-alt-label">修正版</span>
          <span className="gp-alt-text">{analysis.rewritten}</span>
        </label>
      )}
      {analysis.native_tip && (
        <label className="gp-alt">
          <input type="checkbox" checked={saveNative}
            onChange={(e) => setSaveNative(e.target.checked)} />
          <span className="gp-alt-label">地道版</span>
          <span className="gp-alt-text">{analysis.native_tip}</span>
        </label>
      )}

      <div className="gp-actions">
        <button className="primary" disabled={busy || done} onClick={confirm}>
          {busy ? "处理中…" : "✓ 批量加入复习"}
        </button>
        {msg && <span className="gp-msg">{msg}</span>}
      </div>
    </div>
  );
}
