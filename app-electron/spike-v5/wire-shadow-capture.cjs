const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/shadow/ShadowPage.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// 1) import
R(
  `import type { ShadowDueItem, ShadowPracticeResult } from "../api";`,
  `import type { ShadowDueItem, ShadowPracticeResult } from "../api";
import { AssetCaptureSheet } from "../components/AssetCaptureSheet";

function shHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}`,
  "import"
);
// 2) state
R(
  `  const draftLoadedRef = useRef(false);`,
  `  const draftLoadedRef = useRef(false);
  const [capOpen, setCapOpen] = useState(false);`,
  "state"
);
// 3) 按钮：① 目标句卡片操作行
R(
  `          <button onClick={() => { stopOwnClip(); audioRef.current?.pause(); speak(target); }} disabled={!target.trim()}>🔈 听示范（整句）</button>
          <span className="sh-pill">{wordCount} 词</span>`,
  `          <button onClick={() => { stopOwnClip(); audioRef.current?.pause(); speak(target); }} disabled={!target.trim()}>🔈 听示范（整句）</button>
          <button className="ghost2" onClick={() => setCapOpen(true)} disabled={!target.trim()}>转为练习</button>
          <span className="sh-pill">{wordCount} 词</span>`,
  "button"
);
// 4) 渲染 sheet（在根 div 结束前）
R(
  `      {err && <div className="err">{err}</div>}
    </div>
  );
}`,
  `      {err && <div className="err">{err}</div>}
      <AssetCaptureSheet open={capOpen}
        source={{ originKind: "shadow", originRef: "sh-" + shHash(target), title: "跟读台", sentence: target }}
        initialText={target}
        onClose={() => setCapOpen(false)}
        onWord={(w: string, sent: string) => api.createShadowNote({ word: w, sentence: sent })}
        onDone={() => setCapOpen(false)} />
    </div>
  );
}`,
  "sheet"
);
fs.writeFileSync(p, s);
console.log("ShadowPage sheet wired");
