const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/components/AssetCaptureSheet.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  if (s.indexOf(oldStr, i + 1) >= 0) throw new Error("NOT UNIQUE: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// 1) ipaBusy state
R(
  `  const [busy, setBusy] = useState(false);`,
  `  const [ipaBusy, setIpaBusy] = useState(false);
  const [busy, setBusy] = useState(false);`,
  "ipaBusy state"
);

// 2) handlers after sentence
R(
  `  if (!open || !source) return null;
  const src = source;
  const sentence = src.sentence || canonical;`,
  `  if (!open || !source) return null;
  const src = source;
  const sentence = src.sentence || canonical;

  const fillIpa = async () => {
    const toks = sentence.split(/\\s+/)
      .map((w) => w.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, "")).filter(Boolean);
    if (!toks.length) return;
    setIpaBusy(true);
    try {
      const ph = await api.phonetics(toks);
      const parts = ph.map((x, i) => (x ? \`/\${x}/\` : toks[i]));
      const joined = parts.join(" ");
      if (joined) setIpa(joined);
    } catch { /* 取音标失败留空 */ }
    finally { setIpaBusy(false); }
  };
  const chooseKind = (k: AssetKind) => {
    setKind(k); setResult(""); setErr("");
    if (k === "grammar" && !grammarAnswer.trim()) setGrammarAnswer(sentence);
    if (k === "pronunciation" && !ipa.trim()) void fillIpa();
  };`,
  "handlers"
);

// 3) kind buttons
R(
  `              onClick={() => { setKind(k); setResult(""); setErr(""); }}`,
  `              onClick={() => chooseKind(k)}`,
  "kind buttons"
);

// 4) IPA input busy state
R(
  `            <input value={ipa} onChange={(e) => setIpa(e.target.value)} placeholder="可稍后再补" />`,
  `            <input value={ipa} onChange={(e) => setIpa(e.target.value)}
              placeholder={ipaBusy ? "AI 取音标中…" : "可稍后再补"} disabled={ipaBusy} />`,
  "ipa input"
);

fs.writeFileSync(p, s);
console.log("sheet kind auto-fill wired");
