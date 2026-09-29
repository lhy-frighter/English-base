const fs = require("fs");
const ap = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(ap, "utf8");
let changed = false;
function rep(old, neu, label) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.replace(old, neu); changed = true; console.log("patched", label);
}

// 1) import 带类型
rep(
  'import ConversationPage from "./conversation/ConversationPage";',
  'import ConversationPage, { type UsePrompt } from "./conversation/ConversationPage";',
  "import");

// 2) state（在 learnedSummary state 后）
rep(
  '  const [learnedSummary, setLearnedSummary] = useState<TextLearnedSummary | null>(null);',
  '  const [learnedSummary, setLearnedSummary] = useState<TextLearnedSummary | null>(null);\n' +
  '  const [usePrompt, setUsePrompt] = useState<UsePrompt | null>(null);\n' +
  '  const [useCounts, setUseCounts] = useState<{\n' +
  '    used_spontaneously: number; used_prompted: number;\n' +
  '    used_after_correction: number; recognized: number;\n' +
  '  } | null>(null);',
  "state");

// 3) 换卡重置 + 资产卡拉取用出次数（在换卡重置 effect 中扩展）
rep(
  "  // 换卡时重置作答状态\n" +
  "  useEffect(() => {\n" +
  "    setGuess(\"\"); setChecked(null); setChosen(null); setShowBack(false); setEnDefOpen(false);\n" +
  "  }, [card?.card_id]);",
  "  // 换卡时重置作答状态\n" +
  "  useEffect(() => {\n" +
  "    setGuess(\"\"); setChecked(null); setChosen(null); setShowBack(false); setEnDefOpen(false);\n" +
  "    setUseCounts(null);\n" +
  "    if (card?.asset_id) {\n" +
  "      api.assetUseCounts(card.asset_id)\n" +
  "        .then(setUseCounts).catch(() => {});\n" +
  "    }\n" +
  "  }, [card?.card_id]);",
  "reset effect");

// 4) 资产卡背：用出次数 + 再用一次（插在 asset-back div 末尾，chunk_recall 例句之后）
const anchor =
  '                          {card.card_type === "chunk_recall" && card.full && card.full !== card.word &&\n' +
  '                            <p className="orig"><span className="lbl">例句</span>{card.full}</p>}\n' +
  '                        </div>';
const neu =
  '                          {card.card_type === "chunk_recall" && card.full && card.full !== card.word &&\n' +
  '                            <p className="orig"><span className="lbl">例句</span>{card.full}</p>}\n' +
  '                          <div className="use-zone">\n' +
  '                            {useCounts && (\n' +
  '                              <p className="use-stats">\n' +
  '                                自然用出 <b>{useCounts.used_spontaneously}</b> ·\n' +
  '                                引导用出 {useCounts.used_prompted} ·\n' +
  '                                纠正后 {useCounts.used_after_correction}\n' +
  '                                {useCounts.recognized > 0 ? <> · 识别 {useCounts.recognized}</> : null}\n' +
  '                              </p>\n' +
  '                            )}\n' +
  '                            <button className="ghost2 use-again" title="跳到对话，用这个表达造一句（记为引导用出）"\n' +
  '                              onClick={() => {\n' +
  '                                setUsePrompt({\n' +
  '                                  assetId: card.asset_id!, canonical: card.word,\n' +
  '                                  kind: card.asset_kind || "chunk",\n' +
  '                                });\n' +
  '                                setTab("chat");\n' +
  '                              }}>再用一次（对话造句）</button>\n' +
  '                          </div>\n' +
  '                        </div>';
rep(anchor, neu, "use zone");

// 5) ConversationPage 渲染传参
rep(
  '{tab === "chat" && <ConversationPage onSendShadow={(t) => sendToShadow(t)} />}',
  '{tab === "chat" && <ConversationPage\n' +
  '  onSendShadow={(t) => sendToShadow(t)}\n' +
  '  usePrompt={usePrompt}\n' +
  '  onPromptConsumed={() => setUsePrompt(null)}\n' +
  ' />}',
  "render");

if (changed) { fs.writeFileSync(ap, s); console.log("written"); }
else console.log("no changes");
