// TutorTeachPanel：TEACH 教学点面板（V9 #147）
// 词块 / 关键词 / 语法点均为草稿：点击后才打开 AssetCaptureSheet，由用户确认成资产；
// 面板本身零写库；AI 提供的表达只是教学建议，不直接写能力证据。
import { useState } from "react";
import type { TeachPayload } from "./teach-parse";
import type { CapturePrefill } from "../components/AssetCaptureSheet";

interface Props {
  teach: TeachPayload;
  turnKey: string;
  onPick: (prefill: CapturePrefill, sentence: string) => void;
  onDismiss: () => void;
  // 一键直接入库（点击即用户确认，不再弹 sheet）；未提供时回退 onPick
  onQuickCapture?: (prefill: CapturePrefill, sentence: string) => Promise<string>;
}

export function TutorTeachPanel({ teach, onPick, onDismiss, onQuickCapture }: Props) {
  const sentence = teach.en;
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickDone, setQuickDone] = useState("");

  const quickAdd = async () => {
    const prefill: CapturePrefill = { kind: "chunk", canonical: teach.en, gloss: teach.zh, exampleZh: teach.zh };
    if (onQuickCapture) {
      if (quickBusy || quickDone) return;
      setQuickBusy(true);
      try {
        setQuickDone(await onQuickCapture(prefill, sentence));
      } catch (e) {
        setQuickDone("加入失败：" + String((e as Error)?.message || e));
      } finally {
        setQuickBusy(false);
      }
    } else {
      onPick(prefill, sentence);
    }
  };

  return (
    <div className="teach-panel">
      <div className="teach-head">
        <span className="teach-title">说法教学</span>
        <button className="teach-x" onClick={onDismiss} aria-label="关闭教学">×</button>
      </div>
      <div className="teach-sentence">
        <div className="teach-en">{teach.en}</div>
        <div className="teach-zh muted">{teach.zh}</div>
        <button
          type="button"
          className="teach-sentence-add"
          disabled={quickBusy || !!quickDone}
          onClick={() => { void quickAdd(); }}
        >
          {quickDone || (quickBusy ? "加入中…" : "整句加入复习")}
        </button>
      </div>

      {teach.chunks.length > 0 && (
        <div className="teach-section">
          <span className="teach-lbl">地道词块</span>
          <div className="teach-chips">
            {teach.chunks.map((c) => (
              <button
                key={c.en}
                className="teach-chip"
                onClick={() => onPick(
                  { kind: "chunk", canonical: c.en, gloss: c.zh, exampleZh: teach.zh },
                  sentence,
                )}
              >
                {c.en}
              </button>
            ))}
          </div>
        </div>
      )}

      {teach.words.length > 0 && (
        <div className="teach-section">
          <span className="teach-lbl">关键词</span>
          <div className="teach-chips">
            {teach.words.map((w) => (
              <button
                key={w.en}
                className="teach-chip"
                onClick={() => onPick(
                  { kind: "word", canonical: w.en, gloss: w.zh },
                  sentence,
                )}
              >
                {w.en}
              </button>
            ))}
          </div>
        </div>
      )}

      {teach.grammar.length > 0 && (
        <div className="teach-section">
          <span className="teach-lbl">语法点</span>
          <div className="teach-grammar-list">
            {teach.grammar.map((g) => (
              <button
                key={g.structure}
                className="teach-grammar-item"
                onClick={() => onPick(
                  {
                    kind: "grammar", canonical: g.structure, gloss: g.note,
                    exerciseForm: "cloze", grammarAnswer: sentence,
                  },
                  sentence,
                )}
              >
                <span className="teach-structure">{g.structure}</span>
                {g.note && <span className="teach-note muted">{g.note}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
