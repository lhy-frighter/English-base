// S11-a App.tsx：jumpCtx（词+例句段定位）、jumpToText 带句、复习卡「回看原文语境」
const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "src", "App.tsx");
let s = fs.readFileSync(fp, "utf8");
let n = 0;
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); n++; console.log("patched:", label);
}

// 1) state
rep(
`  const [jumpWord, setJumpWord] = useState(""); // 从词卡跳转原文时要定位的词`,
`  const [jumpCtx, setJumpCtx] = useState<{ word: string; sentence: string } | null>(null); // 回语境：词+例句`,
"state");

// 2) effect 整体替换（旧块从注释到 }, [jumpWord, tab, ann]);）
const effStart = "  // 文章渲染后滚动到目标词并闪烁（jumpToText 定义在 annotateNow 之后）";
const effEnd = "  }, [jumpWord, tab, ann]);";
const i0 = s.indexOf(effStart); const i1 = s.indexOf(effEnd);
if (i0 < 0 || i1 < 0) throw new Error("旧 effect 定位失败");
const newEff = fs.readFileSync(path.join(__dirname, "s11a-effect.txt"), "utf8").replace(/\s+$/, "");
s = s.slice(0, i0) + newEff + s.slice(i1 + effEnd.length);
n++; console.log("patched: effect");

// 3) jumpToText 签名与设置
rep(
`  const jumpToText = useCallback(async (textId: number, word: string) => {
    try {
      const t = await api.getText(textId);
      if (!t) return;
      setLexDetail(null);
      await annotateNow(t.raw_text);
      setTab("read");
      setJumpWord(word);
    } catch (e) { setErr(String(e)); }
  }, [annotateNow]);`,
`  const jumpToText = useCallback(async (textId: number, word: string, sentence = "") => {
    try {
      const t = await api.getText(textId);
      if (!t) return;
      setLexDetail(null);
      await annotateNow(t.raw_text);
      setTab("read");
      setJumpCtx({ word, sentence });
    } catch (e) { setErr(String(e)); }
  }, [annotateNow]);`,
"jumpToText");

// 4) 词库详情入口传例句
rep(
`                                        onClick={() => jumpToText(n.text_id!, lexDetail.lemma)}>`,
`                                        onClick={() => jumpToText(n.text_id!, lexDetail.lemma, n.context_sentence)}>`,
"词库入口传句");

// 5) 复习卡背面例句下加「回看原文语境」
rep(
`                      <p className="orig">
                        <span className="lbl">例句</span>
                        <Highlight sentence={card.full} word={card.word} />
                      </p>`,
`                      <p className="orig">
                        <span className="lbl">例句</span>
                        <Highlight sentence={card.full} word={card.word} />
                      </p>
                      {card.text_id ? (
                        <p className="orig context-jump-row">
                          <button type="button" className="context-jump"
                            onClick={() => jumpToText(card.text_id!, card.word, card.full)}>
                            ↗ 回看原文语境
                          </button>
                        </p>
                      ) : null}`,
"复习卡按钮");

fs.writeFileSync(fp, s, "utf8");
console.log("完成", n);
