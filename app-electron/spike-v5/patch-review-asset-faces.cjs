const fs = require("fs");
const p = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(p, "utf8");
function R(oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) throw new Error("NOT FOUND: " + label);
  s = s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

// 1) 自动播放 effect
R(
  `    if (card?.card_type === "l_recog" || card?.card_type === "spelling") speak(card.word);`,
  `    if (card?.card_type === "l_recog" || card?.card_type === "spelling"
      || card?.card_type === "pron_perception") speak(card.word);`,
  "autoplay"
);
// 2) 空格重播
R(
  `        if ((card?.card_type === "l_recog" || card?.card_type === "spelling") && !showBack) speak(card.word); // 听音/听写卡空格=重播`,
  `        if ((card?.card_type === "l_recog" || card?.card_type === "spelling"
          || card?.card_type === "pron_perception") && !showBack) speak(card.word); // 听音/听写/发音卡空格=重播`,
  "space replay"
);
// 3) cardbar 类型标签
R(
  `                      : card.card_type === "concept" ? "概念" : "认读"}`,
  `                      : card.card_type === "chunk_recall" ? "词块"
                      : card.card_type === "chunk_cloze" ? "词块填空"
                      : card.card_type === "grammar_pattern" ? "语法"
                      : card.card_type === "pron_perception" ? "发音听辨"
                      : card.card_type === "concept_recall" ? "考点"
                      : card.card_type === "concept" ? "概念" : "认读"}`,
  "cardbar labels"
);
// 4) 正面：听辨类 + 文本类
R(
  `                {(card.card_type === "l_recog" || card.card_type === "spelling") ? (
                  <div className="listen-front">
                    <button className="speaker" onClick={() => speak(card.word)} title="再听一遍（空格）" aria-label="播放发音">🔊</button>
                    <p className="muted">
                      {card.card_type === "l_recog" ? "听发音，选出正确释义" : "听发音，拼写这个单词"}
                      {ttsAvailable() ? "" : "（当前系统无可用语音引擎）"}
                    </p>
                  </div>
                ) : (
                  <p className="sentence">
                    {card.card_type === "concept" ? card.sentence
                      : card.card_type === "cloze" ? card.sentence
                      : card.card_type === "recall" ? card.sentence
                      : <Highlight sentence={card.sentence} word={card.word} />}
                  </p>
                )}`,
  `                {(card.card_type === "l_recog" || card.card_type === "spelling"
                  || card.card_type === "pron_perception") ? (
                  <div className="listen-front">
                    <button className="speaker" onClick={() => speak(card.word)} title="再听一遍（空格）" aria-label="播放发音">🔊</button>
                    <p className="muted">
                      {card.card_type === "l_recog" ? "听发音，选出正确释义"
                        : card.card_type === "spelling" ? "听发音，拼写这个单词"
                        : "听发音，注意这个片段怎么读"}
                      {ttsAvailable() ? "" : "（当前系统无可用语音引擎）"}
                    </p>
                  </div>
                ) : (
                  <p className="sentence">
                    {(card.card_type === "concept" || card.card_type === "cloze"
                      || card.card_type === "recall" || card.card_type === "chunk_recall"
                      || card.card_type === "chunk_cloze" || card.card_type === "grammar_pattern"
                      || card.card_type === "concept_recall")
                      ? card.sentence
                      : <Highlight sentence={card.sentence} word={card.word} />}
                  </p>
                )}`,
  "front"
);
// 5) 背面：在 concept 分支后插入 asset 分支，把词块 fragment 改成普通分支
R(
  `                      ) : <>
                        <div className="back-word">
                          <b className="hw">{card.word}</b>`,
  `                      ) : card.asset_id ? (
                        <div className="asset-back">
                          <div className="back-word">
                            <b className="hw">{card.word}</b>
                            {card.asset_kind === "pronunciation" && card.payload?.ipa &&
                              <span className="phon">/{String(card.payload.ipa)}/</span>}
                          </div>
                          {card.card_type === "chunk_recall" && (
                            <p className="sense-p">{String(card.payload?.zh_intent || card.sense || "（无释义）")}</p>
                          )}
                          {card.card_type === "chunk_cloze" && (
                            <>
                              <p className="sense-p">{card.sense || "（无释义）"}</p>
                              <p className="orig"><span className="lbl">例句</span>{card.full}</p>
                            </>
                          )}
                          {card.card_type === "grammar_pattern" && (
                            <>
                              <p className="sense-p"><b>答案：</b>{card.answer || "（未填答案）"}</p>
                              {String(card.payload?.explanation || card.sense || "") &&
                                <p className="orig">{String(card.payload?.explanation || card.sense)}</p>}
                            </>
                          )}
                          {card.card_type === "pron_perception" && (
                            <p className="sense-p">问题类型：{String(card.payload?.problem_type ?? "")}
                              {card.sense ? " · " + card.sense : ""}</p>
                          )}
                          {card.card_type === "concept_recall" && (
                            <p className="sense-p">{String(card.payload?.strategy || card.sense || "（无说明）")}</p>
                          )}
                          {card.card_type === "chunk_recall" && card.full && card.full !== card.word &&
                            <p className="orig"><span className="lbl">例句</span>{card.full}</p>}
                        </div>
                      ) : (
                        <div className="back-word">
                          <b className="hw">{card.word}</b>`,
  "back branch open"
);
// 6) 词块 fragment 收尾改为普通括号收尾
R(
  `                      </>}
                    </div>
                    <div className="ratings">`,
  `                      )}
                    </div>
                    <div className="ratings">`,
  "back branch close"
);

fs.writeFileSync(p, s);
console.log("App review rendering patched");
