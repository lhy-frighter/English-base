const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/components/AssetCaptureSheet.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  if (s.indexOf(oldStr, i + 1) >= 0) throw new Error("NOT UNIQUE: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// 1) CapturePrefill 类型 + Props
R(
  `interface Props {
  open: boolean;
  source: CaptureSheetSource | null;
  initialText: string;
  onClose: () => void;
  onWord: (word: string, sentence: string) => Promise<{ cards_created?: number; already?: boolean }>;
  onDone?: (kind: AssetKind) => void;
}`,
  `export interface CapturePrefill {
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
  onClose: () => void;
  onWord: (word: string, sentence: string) => Promise<{ cards_created?: number; already?: boolean }>;
  onDone?: (kind: AssetKind) => void;
}`
, "props");

// 2) 组件签名 + exampleZh state
R(
  `export function AssetCaptureSheet({ open, source, initialText, onClose, onWord, onDone }: Props) {`,
  `export function AssetCaptureSheet({ open, source, initialText, prefill, onClose, onWord, onDone }: Props) {`,
  "sig"
);
R(
  `  const [ipa, setIpa] = useState("");
  const [busy, setBusy] = useState(false);`,
  `  const [ipa, setIpa] = useState("");
  const [exampleZh, setExampleZh] = useState("");
  const [busy, setBusy] = useState(false);`,
  "exampleZh state"
);

// 3) open effect 应用 prefill
R(
  `    setIpa("");
    setResult("");
    setErr("");
    setKind(suggestKind(text));
  }, [open, initialText]);`,
  `    setIpa("");
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
  }, [open, initialText, prefill]);`,
  "effect"
);

// 4) chunk payload 带 example_zh
R(
  `        if (kind === "chunk") {
          payload = { register, example_en: sentence, zh_intent: gloss };
        } else if (kind === "grammar") {`,
  `        if (kind === "chunk") {
          payload = { register, example_en: sentence, example_zh: exampleZh || undefined, zh_intent: gloss };
        } else if (kind === "grammar") {`,
  "chunk payload"
);

fs.writeFileSync(p, s);
console.log("sheet prefill added");
