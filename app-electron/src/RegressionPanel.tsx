import { useEffect, useRef, useState } from "react";
import { api, type RegressionClip, type ModelCatalogItem } from "./api";
import { evalClip, disposeEval } from "./regression";

const LANG_LABEL: Record<string, string> = { en: "英文", zh: "中文", mixed: "中英混" };
const MODEL_SHORT: Record<string, string> = { "whisper-tiny.en": "tiny.en", "whisper-base": "base" };

// 语音回归集：列出已存录音样本，用当前模型批量重跑，按模型留存 sim/WER（英文）或 CJK 占比（中文），供定档位
export default function RegressionPanel() {
  const [clips, setClips] = useState<RegressionClip[]>([]);
  const [models, setModels] = useState<ModelCatalogItem[]>([]);
  const [evalModel, setEvalModel] = useState("whisper-tiny.en");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");
  const [playId, setPlayId] = useState<string>("");
  const [playUrl, setPlayUrl] = useState("");
  const playUrlRef = useRef("");

  const load = () => api.regressionList().then(setClips).catch((e) => setErr(String(e.message)));
  const loadModels = () => api.modelCatalog().then((cs) => {
    setModels(cs);
    const installed = cs.filter((c) => c.state === "installed").map((c) => c.id);
    if (installed.includes("whisper-base")) setEvalModel("whisper-base");
    else if (installed.length) setEvalModel(installed[0]);
  }).catch((e) => { console.error("[regression] 模型目录加载失败", e); });
  useEffect(() => { load(); loadModels(); }, []);
  useEffect(() => () => { if (playUrlRef.current) URL.revokeObjectURL(playUrlRef.current); }, []);

  const play = async (id: string) => {
    const r = await api.regressionRead(id);
    const u = URL.createObjectURL(new Blob([r.bytes.slice().buffer as ArrayBuffer], { type: r.mime }));
    if (playUrlRef.current) URL.revokeObjectURL(playUrlRef.current);
    playUrlRef.current = u; setPlayUrl(u); setPlayId(id);
  };

  const runAll = async () => {
    setErr(""); setRunning(true);
    try {
      const list = await api.regressionList();
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        setProgress(`用 ${MODEL_SHORT[evalModel] || evalModel} 评测 ${i + 1}/${list.length}：${c.lang} · ${c.ref.slice(0, 18) || "（无参考）"}`);
        try { await evalClip(c, evalModel); }
        catch (e) { setErr(`样本 ${c.ref.slice(0, 12)} 评测失败：${(e as Error).message}`); }
      }
      await load();
      setProgress("");
    } catch (e) { setErr("批量评测失败：" + (e as Error).message); }
    finally { setRunning(false); void disposeEval(); }
  };

  const del = async (id: string) => {
    await api.regressionDelete(id);
    if (playId === id) { if (playUrlRef.current) URL.revokeObjectURL(playUrlRef.current); playUrlRef.current = ""; setPlayUrl(""); setPlayId(""); }
    load();
  };

  // 选中模型的英文平均命中率、中文 CJK 占比
  const enClips = clips.filter((c) => c.lang !== "zh" && c.ref && c.evals[evalModel]);
  const zhClips = clips.filter((c) => c.lang === "zh" && c.evals[evalModel]);
  const avgSim = enClips.length ? Math.round(enClips.reduce((s, c) => s + (c.evals[evalModel].sim ?? 0), 0) / enClips.length) : null;
  const avgCjk = zhClips.length ? +(zhClips.reduce((s, c) => s + c.evals[evalModel].cjkRatio, 0) / zhClips.length).toFixed(2) : null;
  const installed = models.filter((m) => m.state === "installed");
  const evalLine = (mid: string, c: RegressionClip) => {
    const ev = c.evals[mid];
    if (!ev) return null;
    const tag = MODEL_SHORT[mid] || mid;
    if (c.lang === "zh") {
      return <span key={mid} className="rg-model">{tag}：CJK <b className={ev.cjkRatio >= 0.5 ? "good" : "bad"}>{ev.cjkRatio}</b>{ev.hallucinated ? " · 幻觉" : ""} <span className="muted">{ev.text ? `「${ev.text.slice(0, 20)}」` : "空"}</span></span>;
    }
    return <span key={mid} className="rg-model">{tag}：命中率 <b className={(ev.sim ?? 0) >= 85 ? "good" : (ev.sim ?? 0) >= 65 ? "warn" : "bad"}>{ev.sim}%</b> <span className="muted">漏{ev.misses}/替{ev.subs}/多{ev.extras} · {ev.ms}ms</span></span>;
  };

  return (
    <div className="card" style={{ padding: 18, marginTop: 16 }}>
      <style>{`
        .rg-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .rg-row{display:flex;align-items:flex-start;gap:10px;padding:10px 4px;border-bottom:1px solid var(--line,#eef0f3);font-size:13px}
        .rg-ref{flex:1;min-width:0}
        .rg-ref .muted{font-size:12px}
        .rg-badge{font-size:11px;padding:1px 7px;border-radius:10px;background:#eef2f7;color:#33506e;margin-right:6px}
        .rg-badge.zh{background:#fdeceb;color:#b3261e}
        .rg-badge.mixed{background:#fdf3e3;color:#9a6200}
        .rg-eval{font-size:12px;color:var(--ink-2);margin-top:3px;display:flex;flex-direction:column;gap:2px}
        .rg-model b.good{color:#1d6b46}.rg-model b.bad{color:#b3261e}.rg-model b.warn{color:#9a6200}
        .rg-hyp{color:var(--ink-3);font-size:12px;margin-top:2px}`}</style>
      <div className="rg-head">
        <strong>语音回归集</strong>
        <span className="muted">{clips.length} 条样本 · 仅本地 · 用于横向定模型档位</span>
        <label className="muted" style={{ fontSize: 12 }}>评测模型
          <select value={evalModel} onChange={(e) => setEvalModel(e.target.value)} style={{ marginLeft: 6, padding: "6px 8px" }}>
            {installed.length === 0 && <option value="whisper-tiny.en">（未安装模型）</option>}
            {models.map((m) => <option key={m.id} value={m.id} disabled={m.state !== "installed"}>
              {MODEL_SHORT[m.id] || m.id}{m.state === "installed" ? "" : "（未下载）"}{m.multilingual ? " · 多语" : " · 英文"}
            </option>)}
          </select>
        </label>
        <button className="primary" disabled={running || clips.length === 0 || installed.length === 0} onClick={runAll}>
          {running ? "评测中…" : `用 ${MODEL_SHORT[evalModel] || evalModel} 批量评测`}
        </button>
        {avgSim != null && <span className="rg-model">英文平均命中率 <b className={avgSim >= 85 ? "good" : avgSim >= 65 ? "warn" : "bad"}>{avgSim}%</b></span>}
        {avgCjk != null && <span className="rg-model">中文平均 CJK <b className={avgCjk >= 0.5 ? "good" : "bad"}>{avgCjk}</b></span>}
      </div>
      {progress && <div className="muted" style={{ margin: "8px 0" }}>{progress}</div>}
      {err && <div className="err">{err}</div>}
      {clips.length === 0 && <div className="muted" style={{ marginTop: 10 }}>
        还没有样本。跟读台比对结果可"存入语音回归集"，或在上方录音测试后录入；建议 10 句英文 + 2 句中文/中英混说。
      </div>}
      {clips.map((c) => (
        <div key={c.id} className="rg-row">
          <div className="rg-ref">
            <div><span className={"rg-badge " + c.lang}>{LANG_LABEL[c.lang]}</span>{c.ref || "（无参考文本）"}</div>
            {c.hyp && <div className="rg-hyp">采集时（tiny.en）：{c.hyp}</div>}
            {Object.keys(c.evals).length > 0 && <div className="rg-eval">{Object.keys(c.evals).map((mid) => evalLine(mid, c))}</div>}
          </div>
          <button className="ghost2" onClick={() => play(c.id)}>▶ 回听</button>
          <button className="ghost" onClick={() => del(c.id)}>删除</button>
        </div>
      ))}
      {playUrl && <audio controls src={playUrl} style={{ height: 32, marginTop: 10 }} />}
    </div>
  );
}
