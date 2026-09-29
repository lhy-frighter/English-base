const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/conversation/ConversationPage.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  if (s.indexOf(oldStr, i + 1) >= 0) throw new Error("NOT UNIQUE: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// 1) translator import
R(
  `import { inference } from "../inference/coordinator";`,
  `import { inference } from "../inference/coordinator";
import { translator } from "../translate/translate";`,
  "import"
);

// 2) 删除旧 openCap
R(
  `  const openCap = useCallback((text: string, refKey: string) => setCap({ text, ref: refKey }), []);
`,
  ``,
  "old openCap"
);

// 3) 在 teachMap 声明后插入 capAnalyzing + 智能 openCap
R(
  `  const [teachMap, setTeachMap] = useState<Record<string, TeachPayload>>({});`,
  `  const [teachMap, setTeachMap] = useState<Record<string, TeachPayload>>({});
  const [capAnalyzing, setCapAnalyzing] = useState(false);
  // 「转为练习」自动填释义：TEACH 中文 → Bergamot 本地翻译 → 云端快译；失败则留空，不阻塞
  const openCap = async (textRaw: string, refKey: string) => {
    const text = textRaw.trim();
    if (!text) return;
    setCap({ text, ref: refKey });
    setCapAnalyzing(true);
    let gloss = teachMap[refKey]?.zh ?? "";
    try {
      if (!gloss) {
        try {
          await inference.acquire("translation");
          const r = await translator.translate([text], false);
          gloss = r.zh?.[0] ?? "";
        } catch { gloss = ""; }
        finally { inference.release("translation").catch(() => {}); }
      }
      if (!gloss && engine === "cloud") {
        try { gloss = await cloudEngine.quickTranslate(text); } catch { gloss = ""; }
      }
      if (gloss) setCap((prev) => (prev && prev.ref === refKey ? { ...prev, gloss } : prev));
    } finally {
      setCapAnalyzing(false);
    }
  };`,
  "new openCap"
);

// 4) onClick 改为 void（异步函数直接调用也可，但显式 void 更清晰）
R(
  `                      onClick={() => openCap(t.text, t.turnKey)}>转为练习</button>`,
  `                      onClick={() => { void openCap(t.text, t.turnKey); }}>转为练习</button>`,
  "user onclick"
);
R(
  `                    onClick={() => openCap(t.committedText || t.text, t.turnKey)}>转为练习</button>`,
  `                    onClick={() => { void openCap(t.committedText || t.text, t.turnKey); }}>转为练习</button>`,
  "asst onclick"
);

// 5) sheet props
R(
  `        prefill={cap?.prefill ?? null}
        onClose={() => setCap(null)}
        onWord={capWord}
      />`,
  `        prefill={cap?.prefill ?? null}
        analyzing={capAnalyzing}
        autoGloss={cap?.gloss}
        onClose={() => setCap(null)}
        onWord={capWord}
      />`,
  "sheet props"
);

fs.writeFileSync(p, s);
console.log("smart openCap wired");
