const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/shadow/ShadowPage.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  if (s.indexOf(oldStr, i + 1) >= 0) throw new Error("NOT UNIQUE: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// 1) pick 类型加 pk
R(
  `  const [pick, setPick] = useState<{ word: string; span: Span | null } | null>(null);`,
  `  const [pick, setPick] = useState<{ word: string; span: Span | null; pk: "miss" | "sub" } | null>(null);`,
  "pick type"
);

// 2) capPrefill state
R(
  `  const [capOpen, setCapOpen] = useState(false);`,
  `  const [capOpen, setCapOpen] = useState(false);
  const [capPrefill, setCapPrefill] = useState<import("../components/AssetCaptureSheet").CapturePrefill | null>(null);`,
  "capPrefill state"
);

// 3) clickProblem 带 pk
R(
  `    const op = res!.ops[idx] as Extract<AlignOp, { kind: "miss" | "sub" }>;
    const span = op.kind === "sub" ? spanOf(idx) : null;
    setPick({ word: op.ref, span });`,
  `    const op = res!.ops[idx] as Extract<AlignOp, { kind: "miss" | "sub" }>;
    const span = op.kind === "sub" ? spanOf(idx) : null;
    setPick({ word: op.ref, span, pk: op.kind });`,
  "clickProblem"
);

// 4) pick bar 加「记为发音问题」
R(
  `                  <button className="primary" disabled={adding} onClick={confirmAdd}>{adding ? "加入中…" : "✓ 确认加入复习"}</button>
                  <button className="ghost2" onClick={() => setPick(null)}>取消（只是识别误差）</button>`,
  `                  <button className="primary" disabled={adding} onClick={confirmAdd}>{adding ? "加入中…" : "✓ 确认加入复习"}</button>
                  <button className="ghost2" onClick={() => void markPronProblem()}>🎯 记为发音问题（音素/重读/弱读/连读…）</button>
                  <button className="ghost2" onClick={() => setPick(null)}>取消（只是识别误差）</button>`,
  "pick bar button"
);

// 5) markPronProblem 函数（插在 confirmAdd 之后）
R(
  `  // 存入语音回归集（英文样本：参考句=冻结目标句，假设=本次识别）`,
  `  // 把问题词记为发音资产：词级 IPA 自动填；替换默认音素问题、漏词默认弱读，用户可在 sheet 改类型
  const markPronProblem = async () => {
    if (!pick) return;
    let ipa = "";
    try {
      const ph = await api.phonetics([pick.word]);
      if (ph[0]) ipa = \`/\${ph[0]}/\`;
    } catch { /* 音标留空 */ }
    setCapPrefill({
      kind: "pronunciation",
      canonical: pick.word,
      ipa,
      problemType: pick.pk === "sub" ? "segmental" : "weakform",
    });
    setCapOpen(true);
  };

  // 卡顿处记为节奏问题
  const markRhythm = () => {
    setCapPrefill({ kind: "pronunciation", problemType: "rhythm" });
    setCapOpen(true);
  };

  // 存入语音回归集（英文样本：参考句=冻结目标句，假设=本次识别）`,
  "markPronProblem fn"
);

// 6) gap pills 可点击
R(
  `{res.gaps.map((g, i) => <span key={i} className="sh-pill" style={{ marginRight: 6 }}>「{g.afterRef}」后停 {g.sec}s</span>)}`,
  `{res.gaps.map((g, i) => <span key={i} className="sh-pill" style={{ marginRight: 6, cursor: "pointer" }}
            title="记为节奏问题" onClick={() => markRhythm()}>「{g.afterRef}」后停 {g.sec}s</span>)}`,
  "gap pills"
);

// 7) sheet prefill + onDone 产出卡
R(
  `      <AssetCaptureSheet open={capOpen}
        source={{ originKind: "shadow", originRef: "sh-" + shHash(target), title: "跟读台", sentence: target }}
        initialText={target}
        onClose={() => setCapOpen(false)}
        onWord={(w: string, sent: string) => api.createShadowNote({ word: w, sentence: sent })}
        onDone={() => setCapOpen(false)} />`,
  `      <AssetCaptureSheet open={capOpen}
        source={{ originKind: "shadow", originRef: "sh-" + shHash(target), title: "跟读台", sentence: target }}
        initialText={target}
        prefill={capPrefill}
        onClose={() => { setCapOpen(false); setCapPrefill(null); }}
        onWord={(w: string, sent: string) => api.createShadowNote({ word: w, sentence: sent })}
        onDone={(kind, r) => {
          if (kind === "pronunciation" && r?.asset_id) {
            void api.addPronProductionCard(r.asset_id).catch(() => {});
          }
          setCapOpen(false); setCapPrefill(null);
        }} />`,
  "sheet render"
);

fs.writeFileSync(p, s);
console.log("shadow pronunciation marking wired");
