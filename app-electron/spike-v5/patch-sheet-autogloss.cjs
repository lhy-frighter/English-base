const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/components/AssetCaptureSheet.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  if (s.indexOf(oldStr, i + 1) >= 0) throw new Error("NOT UNIQUE: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// props 类型
R(
  `  initialText: string;
  prefill?: CapturePrefill | null;
  onClose: () => void;`,
  `  initialText: string;
  prefill?: CapturePrefill | null;
  analyzing?: boolean;
  autoGloss?: string;
  onClose: () => void;`,
  "props type"
);

// 组件签名
R(
  `export function AssetCaptureSheet({ open, source, initialText, prefill, onClose, onWord, onDone }: Props) {`,
  `export function AssetCaptureSheet({ open, source, initialText, prefill, analyzing, autoGloss, onClose, onWord, onDone }: Props) {`,
  "sig"
);

// autoGloss 独立同步（只更新释义，不重置其它字段）
R(
  `  const idempotencyKey = useMemo(() => {`,
  `  // AI 自动释义到达后只更新 gloss（不触发整表重置）
  useEffect(() => {
    if (open && autoGloss) setGloss(autoGloss);
  }, [open, autoGloss]);

  const idempotencyKey = useMemo(() => {`,
  "autoGloss effect"
);

// 释义输入框：分析中提示
R(
  `        <label className="cap-field">
          <span>{kind === "chunk" ? "中文意图" : kind === "pronunciation" ? "备注" : "中文释义/说明"}</span>
          <input value={gloss} onChange={(e) => setGloss(e.target.value)} placeholder="可稍后再补" />
        </label>`,
  `        <label className="cap-field">
          <span>{kind === "chunk" ? "中文意图" : kind === "pronunciation" ? "备注" : "中文释义/说明"}</span>
          <input value={gloss} onChange={(e) => setGloss(e.target.value)}
            placeholder={analyzing ? "AI 分析中…" : "可稍后再补"} disabled={analyzing && !gloss} />
        </label>`,
  "gloss input"
);

fs.writeFileSync(p, s);
console.log("sheet analyzing props added");
