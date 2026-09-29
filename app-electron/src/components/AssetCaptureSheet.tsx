// AssetCaptureSheet：「转为练习」统一组件（V9 #142）
// 来源：阅读划选 / 对话气泡 / 跟读问题 / 考试错题。
// 系统建议资产类型（word/chunk/grammar/pronunciation/concept），用户最终裁决；
// word 走宿主页面既有建卡链路（onWord），其余四类走 api.captureAsset 统一资产服务。
import { useEffect, useMemo, useState } from "react";
import { api, type AssetKind, type AssetOriginKind, type CaptureAssetResult } from "../api";
import { speak } from "../tts";

export interface CaptureSheetSource {
  originKind: AssetOriginKind;
  originRef: string;
  title: string;
  sentence: string;
}
export interface CapturePrefill {
  kind?: AssetKind;
  canonical?: string;
  gloss?: string;
  register?: "spoken" | "written";
  exerciseForm?: string;
  problemType?: string;
  testPoint?: string;
  grammarAnswer?: string;
  ipa?: string;
  exampleZh?: string;
}
interface Props {
  open: boolean;
  source: CaptureSheetSource | null;
  initialText: string;
  prefill?: CapturePrefill | null;
  analyzing?: boolean;
  autoGloss?: string;
  onSendShadow?: (text: string) => void;
  onClose: () => void;
  onWord: (word: string, sentence: string) => Promise<{ cards_created?: number; already?: boolean }>;
  onDone?: (kind: AssetKind, r?: CaptureAssetResult) => void;
}

const KIND_LABEL: Record<AssetKind, string> = {
  word: "单词",
  chunk: "词块/表达",
  grammar: "语法",
  pronunciation: "发音",
  concept: "考点/概念",
};
const CARD_PREVIEW: Record<AssetKind, string[]> = {
  word: ["认读", "挖空", "释义回忆", "听音辨义", "拼写（走现有建卡链路）"],
  chunk: ["词块回忆（英文→中文意图）", "语境填空"],
  grammar: ["语法练习（一张具体练习）"],
  pronunciation: ["发音听辨（产出卡需录音人工确认后另建）"],
  concept: ["考点/策略回忆"],
};

function suggestKind(text: string): AssetKind {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return "word";
  return "chunk";
}

function shortHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function AssetCaptureSheet({ open, source, initialText, prefill, analyzing, autoGloss, onSendShadow, onClose, onWord, onDone }: Props) {
  const [kind, setKind] = useState<AssetKind>("chunk");
  const [canonical, setCanonical] = useState("");
  const [gloss, setGloss] = useState("");
  const [register, setRegister] = useState<"spoken" | "written">("spoken");
  const [exerciseForm, setExerciseForm] = useState("cloze");
  const [problemType, setProblemType] = useState("segmental");
  const [testPoint, setTestPoint] = useState("");
  const [grammarAnswer, setGrammarAnswer] = useState("");
  const [ipa, setIpa] = useState("");
  const [exampleZh, setExampleZh] = useState("");
  const [ipaBusy, setIpaBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [err, setErr] = useState("");

  // 打开时：重置全部字段、按选中文本建议类型
  useEffect(() => {
    if (!open) return;
    const text = initialText.trim();
    setCanonical(text);
    setGloss("");
    setRegister("spoken");
    setExerciseForm("cloze");
    setProblemType("segmental");
    setTestPoint("");
    setGrammarAnswer("");
    setIpa("");
    setExampleZh(prefill?.exampleZh ?? "");
    setResult("");
    setErr("");
    setKind(prefill?.kind ?? suggestKind(text));
    if (prefill?.canonical != null) setCanonical(prefill.canonical);
    if (prefill?.gloss != null) setGloss(prefill.gloss);
    if (prefill?.register) setRegister(prefill.register);
    if (prefill?.exerciseForm) setExerciseForm(prefill.exerciseForm);
    if (prefill?.problemType) setProblemType(prefill.problemType);
    if (prefill?.testPoint != null) setTestPoint(prefill.testPoint);
    if (prefill?.grammarAnswer != null) setGrammarAnswer(prefill.grammarAnswer);
    if (prefill?.ipa != null) setIpa(prefill.ipa);
  }, [open, initialText, prefill]);

  // AI 自动释义到达后只更新 gloss（不触发整表重置）
  useEffect(() => {
    if (open && autoGloss) setGloss(autoGloss);
  }, [open, autoGloss]);

  const idempotencyKey = useMemo(() => {
    if (!source) return "";
    return `ui-${source?.originKind ?? ""}-${source?.originRef ?? ""}-${kind}-${shortHash(canonical)}`;
  }, [source, kind, canonical]);

  if (!open || !source) return null;
  const src = source;
  const sentence = src.sentence || canonical;

  const fillIpa = async () => {
    const toks = sentence.split(/\s+/)
      .map((w) => w.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, "")).filter(Boolean);
    if (!toks.length) return;
    setIpaBusy(true);
    try {
      const ph = await api.phonetics(toks);
      const parts = ph.map((x, i) => (x ? `/${x}/` : toks[i]));
      const joined = parts.join(" ");
      if (joined) setIpa(joined);
    } catch { /* 取音标失败留空 */ }
    finally { setIpaBusy(false); }
  };
  const chooseKind = (k: AssetKind) => {
    setKind(k); setResult(""); setErr("");
    if (k === "grammar" && !grammarAnswer.trim()) setGrammarAnswer(sentence);
    if (k === "pronunciation" && !ipa.trim()) void fillIpa();
  };

  async function confirm() {
    const canon = canonical.trim();
    if (!canon) { setErr("要学习的内容不能为空"); return; }
    setBusy(true);
    setErr("");
    try {
      let rAsset: CaptureAssetResult | undefined;
      if (kind === "word") {
        const r = await onWord(canon, sentence);
        setResult(r.already
          ? `「${canon}」已在复习集中（未重复建卡）`
          : `「${canon}」已加入复习（${r.cards_created ?? 0} 张卡）`);
      } else {
        let payload: Record<string, unknown> = {};
        if (kind === "chunk") {
          payload = { register, example_en: sentence, example_zh: exampleZh || undefined, zh_intent: gloss };
        } else if (kind === "grammar") {
          payload = { exercise_form: exerciseForm, prompt: canon, answer: grammarAnswer, explanation: gloss };
        } else if (kind === "pronunciation") {
          payload = { problem_type: problemType, ipa, perception: true };
        } else if (kind === "concept") {
          payload = { test_point: testPoint || gloss, strategy: gloss };
        }
        const r = await api.captureAsset({
          asset_kind: kind,
          canonical: canon,
          gloss,
          payload,
          test_point: testPoint || gloss,
          idempotency_key: idempotencyKey,
          encounter: {
            origin_kind: src.originKind,
            origin_ref: src.originRef,
            title: src.title,
            sentence,
            locator: { via: "capture-sheet" },
          },
        });
        const what = r.replayed
          ? "此前已收录（未重复建卡）"
          : r.created
            ? `已新建「${KIND_LABEL[kind]}」资产、${r.cards_created} 张卡`
            : `已追加一次相遇记录、${r.cards_created} 张卡`;
        setResult(`${what}；相遇记录 ${r.encounter_added ? "+1" : "已存在"}`);
        rAsset = r;
      }
      onDone?.(kind, rAsset);
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cap-overlay" onClick={onClose}>
      <div className="cap-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cap-head">
          <span>转为练习</span>
          <button className="cap-x" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className="cap-source muted">
          来自：{source.title} · {KIND_ORIGIN_LABEL[source.originKind]}
        </div>
        {sentence && sentence !== canonical && (
          <div className="cap-context">{sentence}</div>
        )}

        <div className="cap-kind-row">
          {(Object.keys(KIND_LABEL) as AssetKind[]).map((k) => (
            <button
              key={k}
              className={kind === k ? "cap-kind on" : "cap-kind"}
              onClick={() => chooseKind(k)}
              type="button"
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <label className="cap-field">
          <span>{kind === "word" ? "单词" : "目标内容（英文）"}</span>
          <textarea rows={2} value={canonical} onChange={(e) => setCanonical(e.target.value)} />
        </label>

        <label className="cap-field">
          <span>{kind === "chunk" ? "中文意图" : kind === "pronunciation" ? "备注" : "中文释义/说明"}</span>
          <input value={gloss} onChange={(e) => setGloss(e.target.value)}
            placeholder={analyzing ? "AI 分析中…" : "可稍后再补"} disabled={analyzing && !gloss} />
        </label>

        {kind === "chunk" && (
          <label className="cap-field cap-inline">
            <span>语域</span>
            <select value={register} onChange={(e) => setRegister(e.target.value as "spoken" | "written")}>
              <option value="spoken">口语</option>
              <option value="written">书面</option>
            </select>
          </label>
        )}
        {kind === "grammar" && (
          <label className="cap-field cap-inline">
            <span>练习形式</span>
            <select value={exerciseForm} onChange={(e) => setExerciseForm(e.target.value)}>
              <option value="cloze">填空</option>
              <option value="transformation">改写</option>
              <option value="error_spotting">找错</option>
            </select>
          </label>
        )}
        {kind === "grammar" && (
          <label className="cap-field">
            <span>正确答案</span>
            <input value={grammarAnswer} onChange={(e) => setGrammarAnswer(e.target.value)} />
          </label>
        )}
        {kind === "pronunciation" && (
          <label className="cap-field cap-inline">
            <span>问题类型</span>
            <select value={problemType} onChange={(e) => setProblemType(e.target.value)}>
              <option value="segmental">音素</option>
              <option value="liaison">连读</option>
              <option value="stress">重音</option>
              <option value="weakform">弱读</option>
              <option value="rhythm">节奏</option>
            </select>
          </label>
        )}
        {kind === "concept" && (
          <label className="cap-field">
            <span>考点</span>
            <input value={testPoint} onChange={(e) => setTestPoint(e.target.value)} />
          </label>
        )}

        {kind === "pronunciation" && (
          <label className="cap-field cap-inline">
            <span>IPA</span>
            <input value={ipa} onChange={(e) => setIpa(e.target.value)}
              placeholder={ipaBusy ? "AI 取音标中…" : "可稍后再补"} disabled={ipaBusy} />
          </label>
        )}
        <div className="cap-preview">
          <span className="cap-preview-lbl">将生成</span>
          {CARD_PREVIEW[kind].map((c) => <em key={c} className="cap-chip">{c}</em>)}
          {kind === "pronunciation" && (
            <button type="button" className="cap-listen" onClick={() => void speak(canonical)}>🔊 听示范</button>
          )}
          {kind === "pronunciation" && onSendShadow && (
            <button type="button" className="cap-listen cap-to-shadow"
              onClick={() => { onSendShadow(sentence || canonical); onClose(); }}>🎙 送入跟读台检测这句</button>
          )}
        </div>

        {err && <div className="cap-err">{err}</div>}
        {result ? (
          <div className="cap-result">
            <div>{result}</div>
            <button className="primary" onClick={onClose}>完成</button>
          </div>
        ) : (
          <button className="primary cap-confirm" disabled={busy} onClick={() => void confirm()}>
            {busy ? "处理中…" : "确认加入复习"}
          </button>
        )}
      </div>
    </div>
  );
}

const KIND_ORIGIN_LABEL: Record<AssetOriginKind, string> = {
  reading: "阅读",
  conversation: "对话",
  shadow: "跟读",
  exam: "考试",
  syllabus: "考纲",
};
