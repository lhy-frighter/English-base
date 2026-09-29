const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/components/AssetCaptureSheet.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  if (s.indexOf(oldStr, i + 1) >= 0) throw new Error("NOT UNIQUE: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// 1) import CaptureAssetResult
R(
  `import { api, type AssetKind, type AssetOriginKind } from "../api";`,
  `import { api, type AssetKind, type AssetOriginKind, type CaptureAssetResult } from "../api";`,
  "import"
);

// 2) props
R(
  `  analyzing?: boolean;
  autoGloss?: string;
  onClose: () => void;`,
  `  analyzing?: boolean;
  autoGloss?: string;
  onSendShadow?: (text: string) => void;
  onClose: () => void;`,
  "props onSendShadow"
);
R(
  `  onDone?: (kind: AssetKind) => void;`,
  `  onDone?: (kind: AssetKind, r?: CaptureAssetResult) => void;`,
  "onDone type"
);
R(
  `export function AssetCaptureSheet({ open, source, initialText, prefill, analyzing, autoGloss, onClose, onWord, onDone }: Props) {`,
  `export function AssetCaptureSheet({ open, source, initialText, prefill, analyzing, autoGloss, onSendShadow, onClose, onWord, onDone }: Props) {`,
  "sig"
);

// 3) confirm: capture result and pass
R(
  `        const r = await api.captureAsset({`,
  `        let rAsset: CaptureAssetResult | undefined;
        const r = await api.captureAsset({`,
  "rAsset decl"
);
R(
  `        setResult(\`\${what}；相遇记录 \${r.encounter_added ? "+1" : "已存在"}\`);
      }
      onDone?.(kind);`,
  `        setResult(\`\${what}；相遇记录 \${r.encounter_added ? "+1" : "已存在"}\`);
        rAsset = r;
      }
      onDone?.(kind, rAsset);`,
  "onDone call"
);

// 4) pronunciation preview area: add send-to-shadow button
R(
  `          {kind === "pronunciation" && (
            <button type="button" className="cap-listen" onClick={() => void speak(canonical)}>🔊 听示范</button>
          )}`,
  `          {kind === "pronunciation" && (
            <button type="button" className="cap-listen" onClick={() => void speak(canonical)}>🔊 听示范</button>
          )}
          {kind === "pronunciation" && onSendShadow && (
            <button type="button" className="cap-listen cap-to-shadow"
              onClick={() => { onSendShadow(sentence || canonical); onClose(); }}>🎙 送入跟读台检测这句</button>
          )}`,
  "send shadow button"
);

fs.writeFileSync(p, s);
console.log("sheet shadow wiring added");
