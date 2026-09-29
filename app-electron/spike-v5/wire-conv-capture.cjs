const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(p, "utf8");
function rep(oldStr, newStr, label) {
  if (!s.includes(oldStr)) throw new Error("NOT FOUND: " + label);
  s = s.replace(oldStr, newStr);
}

// 1) 导入
rep(
  `import { VadController } from "./vad-controller";`,
  `import { VadController } from "./vad-controller";
import { AssetCaptureSheet } from "../components/AssetCaptureSheet";`,
  "import"
);

// 2) 状态与回调
rep(
  `  const [input, setInput] = useState("");`,
  `  const [input, setInput] = useState("");
  const [cap, setCap] = useState<{ text: string; ref: string } | null>(null);
  const openCap = useCallback((text: string, refKey: string) => setCap({ text, ref: refKey }), []);
  const capWord = useCallback(async (word: string, sentence: string) =>
    api.createShadowNote({ word, sentence }), []);`,
  "state"
);

// 3) 用户气泡加「转为练习」
rep(
  `              <div key={t.turnKey} className="conv-msg conv-user">
                <div className="conv-bubble">{t.text}</div>
                {correction && <div className="conv-correction">✏️ {correction}</div>}
              </div>`,
  `              <div key={t.turnKey} className="conv-msg conv-user">
                <div className="conv-bubble">{t.text}</div>
                {correction && <div className="conv-correction">✏️ {correction}</div>}
                {t.text && (
                  <div className="conv-cap-row">
                    <button type="button" className="ghost2"
                      onClick={() => openCap(t.text, t.turnKey)}>转为练习</button>
                  </div>
                )}
              </div>`,
  "user bubble"
);

// 4) 助手 completed 气泡加「转为练习」
rep(
  `              {t.status === "failed" && (
                <div className="conv-retry">
                  <button className="ghost2" onClick={() => { void retryFailedTurn(false); }}>云端重试</button>
                  <button className="ghost2" onClick={() => { void retryFailedTurn(true); }}>切本地重试</button>
                </div>
              )}
            </div>`,
  `              {t.status === "failed" && (
                <div className="conv-retry">
                  <button className="ghost2" onClick={() => { void retryFailedTurn(false); }}>云端重试</button>
                  <button className="ghost2" onClick={() => { void retryFailedTurn(true); }}>切本地重试</button>
                </div>
              )}
              {t.status === "completed" && (t.committedText || t.text) && (
                <div className="conv-cap-row">
                  <button type="button" className="ghost2"
                    onClick={() => openCap(t.committedText || t.text, t.turnKey)}>转为练习</button>
                </div>
              )}
            </div>`,
  "assistant bubble"
);

// 5) 渲染 sheet
rep(
  `        <button className="btn-primary" disabled={busy || !input.trim()} onClick={() => { void send(); }}>发送</button>
      </div>
    </div>
  );
}`,
  `        <button className="btn-primary" disabled={busy || !input.trim()} onClick={() => { void send(); }}>发送</button>
      </div>
      <AssetCaptureSheet
        open={!!cap}
        source={cap ? { originKind: "conversation", originRef: cap.ref, title: "英语对话", sentence: cap.text } : null}
        initialText={cap?.text ?? ""}
        onClose={() => setCap(null)}
        onWord={capWord}
      />
    </div>
  );
}`,
  "sheet render"
);

fs.writeFileSync(p, s);
console.log("ConversationPage wired");
