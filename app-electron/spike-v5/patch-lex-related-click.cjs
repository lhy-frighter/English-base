// 词库详情卡：同根/近义词 chips 可点击（复用阅读面板 relatedChips：跳查+发音+加复习）
const fs = require("fs");
const fp = "src/App.tsx";
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

rep(
`                              {lexDetail.related && lexDetail.related.family.length > 0 && (
                                <p className="orig">
                                  <span className="lbl">同根</span>
                                  {lexDetail.related.family.map((s) => (
                                    <em key={s.word} className="syn"><b>{s.word}</b> {s.gloss}</em>
                                  ))}
                                </p>
                              )}
                              {lexDetail.related && lexDetail.related.synonyms.length > 0 && (
                                <p className="orig">
                                  <span className="lbl">近义</span>
                                  {lexDetail.related.synonyms.map((s) => (
                                    <em key={s.word} className="syn"><b>{s.word}</b> {s.gloss}</em>
                                  ))}
                                </p>
                              )}`,
`                              {lexDetail.related && lexDetail.related.family.length > 0 && (
                                <p className="orig">
                                  <span className="lbl">同根</span>
                                  {relatedChips(lexDetail.related.family)}
                                </p>
                              )}
                              {lexDetail.related && lexDetail.related.synonyms.length > 0 && (
                                <p className="orig">
                                  <span className="lbl">近义</span>
                                  {relatedChips(lexDetail.related.synonyms)}
                                </p>
                              )}`,
"词库详情同根/近义可点击");

fs.writeFileSync(fp, s, "utf8");
console.log("saved");
