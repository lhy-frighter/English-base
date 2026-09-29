const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/ExamPage.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// 1) import
R(
  `import { cueSend } from "./shadow/send";`,
  `import { cueSend } from "./shadow/send";
import { AssetCaptureSheet } from "./components/AssetCaptureSheet";`,
  "import"
);
// 2) state
R(
  `  const [wrongFilter, setWrongFilter] = useState<"active" | "archived" | "all">("active");`,
  `  const [wrongFilter, setWrongFilter] = useState<"active" | "archived" | "all">("active");
  const [capW, setCapW] = useState<WrongItem | null>(null);`,
  "state"
);
// 3) 按钮
R(
  `                <button className="primary" onClick={() => redo(w)}>提交重做</button>`,
  `                <button className="primary" onClick={() => redo(w)}>提交重做</button>
                <button className="ghost2" onClick={() => setCapW(w)}>转为练习</button>`,
  "button"
);
// 4) sheet（错题本根 div 结束前）
R(
  `      ))}
    </div>
  );
}`,
  `      ))}
      <AssetCaptureSheet open={capW !== null}
        source={capW ? {
          originKind: "exam",
          originRef: "paper-" + capW.paper_id + "-q-" + capW.q_index,
          title: capW.paper_title,
          sentence: capW.question?.stem ?? "",
        } : null}
        initialText={capW?.question?.stem ?? ""}
        onClose={() => setCapW(null)}
        onWord={(word: string, sent: string) => api.createShadowNote({ word, sentence: sent })}
        onDone={() => setCapW(null)} />
    </div>
  );
}`,
  "sheet"
);
fs.writeFileSync(p, s);
console.log("ExamPage sheet wired");
