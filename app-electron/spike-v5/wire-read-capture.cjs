const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(p, "utf8");
function rep(oldStr, newStr, label) {
  if (!s.includes(oldStr)) throw new Error("NOT FOUND: " + label);
  s = s.replace(oldStr, newStr);
}

// 1) 导入组件
rep(
  `import { speak, speakWord, warmTts, ttsAvailable, onTtsStatus, prewarmKokoro, type TtsStatus } from "./tts";`,
  `import { speak, speakWord, warmTts, ttsAvailable, onTtsStatus, prewarmKokoro, type TtsStatus } from "./tts";
import { AssetCaptureSheet } from "./components/AssetCaptureSheet";`,
  "import"
);

// 2) 状态
rep(
  `  const [selText, setSelText] = useState(""); // 阅读器中当前选中的英文（用于送跟读）`,
  `  const [selText, setSelText] = useState(""); // 阅读器中当前选中的英文（用于送跟读）
  const [capSel, setCapSel] = useState<{ text: string } | null>(null); // 转为练习`,
  "state"
);

// 3) 浮动条加按钮
rep(
  `                <button className="primary" onClick={() => sendToShadow(selText, ann?.text_id)}>送跟读 →</button>
                <button className="ghost" onClick={() => { setSelTrans(null); setSelText(""); }}>关闭</button>`,
  `                <button className="primary" onClick={() => sendToShadow(selText, ann?.text_id)}>送跟读 →</button>
                <button className="ghost" onClick={() => setCapSel({ text: selText })}>转为练习</button>
                <button className="ghost" onClick={() => { setSelTrans(null); setSelText(""); }}>关闭</button>`,
  "strip button"
);

// 4) 渲染 sheet
rep(
  `            <button className="ghost" onClick={() => { setEntry(null); setEntryStart(0); setEntryKey(""); }}>关闭</button>
          </aside>
        )}
      </main>`,
  `            <button className="ghost" onClick={() => { setEntry(null); setEntryStart(0); setEntryKey(""); }}>关闭</button>
          </aside>
        )}
        <AssetCaptureSheet
          open={!!capSel}
          source={capSel ? {
            originKind: "reading",
            originRef: String(ann?.text_id ?? ""),
            title: ann?.title ?? "阅读文章",
            sentence: selText || capSel.text,
          } : null}
          initialText={capSel?.text ?? ""}
          onClose={() => setCapSel(null)}
          onWord={async (word, sentence) => api.createShadowNote({ word, sentence })}
        />
      </main>`,
  "sheet render"
);

fs.writeFileSync(p, s);
console.log("App.tsx reading capture wired");
