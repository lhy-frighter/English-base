// src/components/TranslateJudge.tsx — 句子翻译卡的三层批改 UI（#205）
//
// 交互按定案：
//   ① 本地逐字对比 —— 提交后立刻出结果，零成本、离线；
//   ② 本地相似度 + 差异标注 —— 同一次计算里给出；
//   ③ 云端语法剖析 —— **只在 ①② 判定有错时才出现按钮**，用户点了才发请求。
//      「翻译对了还看语法分析」对用户没价值，自动调又慢又花钱。
//
// 正确时不显示差异标注（正确的人不想看自己哪里"不一样"），只在判错时逐词标红。
import { useState } from "react";
import { Icon } from "../icons";
import { compare, type JudgeResult } from "../translate-judge";
import { deepJudge, type DeepResult } from "../conversation/translate-judge-cloud";

export function TranslateJudge({ sourceEn, referenceZh, onRate }: {
  sourceEn: string;
  referenceZh: string;
  onRate: (rating: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [local, setLocal] = useState<JudgeResult | null>(null);
  const [deep, setDeep] = useState<DeepResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [deepErr, setDeepErr] = useState("");

  const submit = () => {
    setLocal(compare(referenceZh, draft.trim()));
    setDeep(null); setDeepErr("");
  };
  const runDeep = async () => {
    setBusy(true); setDeepErr("");
    try {
      const d = await deepJudge(sourceEn, referenceZh, draft.trim());
      if (d.ok) setDeep(d); else setDeepErr(deepErrText(d.reason || ""));
    } catch (e) { setDeepErr(String((e as Error)?.message || e)); }
    finally { setBusy(false); }
  };
  const reset = () => { setDraft(""); setLocal(null); setDeep(null); setDeepErr(""); };

  const noRef = !referenceZh.trim();

  return (
    <div className="tj">
      <div className="tj-en">{sourceEn}</div>
      {noRef
        ? <p className="muted tj-note">这句暂无参考译文，只能自评。若要进批改队列，去阅读页划词选句「转为练习」——那里有原文配对译文。</p>
        : <textarea className="tj-input form-input" value={draft} rows={4}
            placeholder="写出这句的中文翻译…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }} />}

      {!local ? (
        <div className="tj-row">
          <button className="btn-primary" disabled={!draft.trim()} onClick={submit}>提交对照</button>
          {draft.trim() && <span className="muted tj-note">Ctrl/⌘ + Enter 快捷提交</span>}
        </div>
      ) : (
        <div className="tj-result">
          <div className={"tj-verdict tj-" + local.verdict}>
            {local.verdict === "correct" ? "✓ 逐词一致" : local.reason}
          </div>

          {local.verdict !== "correct" && (
            <>
              <p className="tj-ref">参考译文：{referenceZh}</p>
              <p className="tj-diff">
                {local.tokens.map((t, i) => (
                  <span key={i} className={"tj-tk tj-op-" + t.op}>{t.op === "extra" ? t.b : (t.a || t.b)}</span>
                ))}
              </p>
            </>
          )}

          {local.needsDeep && !deep && !busy && !deepErr && (
            <div className="tj-deep">
              <button className="ghost2" onClick={runDeep}>
                <Icon name="Sparkles" size={14} />用云端 AI 做语法剖析
              </button>
            </div>
          )}
          {busy && <p className="muted tj-note">正在分析…</p>}
          {deepErr && <p className="tj-deep-err">{deepErr}</p>}

          {deep && deep.ok && (
            <div className="tj-ai">
              {deep.verdict && <div className="tj-ai-head">AI 判定：{deep.verdict}</div>}
              {deep.points.length > 0 && <ul>{deep.points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
              {deep.memoryTip && <div className="tj-tip">记忆点：{deep.memoryTip}</div>}
            </div>
          )}

          <div className="tj-row">
            <button className="btn-primary" onClick={() =>
              onRate(local.verdict === "correct" ? 4 : local.verdict === "minor" ? 3 : 2)}>
              按此判定计分
            </button>
            <button className="ghost2" onClick={reset}>重写</button>
          </div>
        </div>
      )}
    </div>
  );
}

function deepErrText(reason: string): string {
  switch (reason) {
    case "grammar_consent_off": return "未开启云端语法分析授权（设置里可开）";
    case "cloud_endpoint_missing": return "未配置云端端点或模型";
    case "cloud_key_missing": return "未配置 API Key";
    default: return "云端分析失败：" + reason;
  }
}