const fs = require("fs");
const ap = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(ap, "utf8");
let changed = false;
function rep(old, neu, label) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.replace(old, neu); changed = true; console.log("patched", label);
}

// 1) import ExamWeakItem
rep(
  'type TextLearnedSummary, type PriorityDto } from "./api";',
  'type TextLearnedSummary, type PriorityDto, type ExamWeakItem } from "./api";',
  "import");

// 2) state（在 weaknesses state 后）
rep(
  "  const [weaknesses, setWeaknesses] = useState<PriorityDto[]>([]);",
  "  const [weaknesses, setWeaknesses] = useState<PriorityDto[]>([]);\n" +
  "  const [examWeak, setExamWeak] = useState<ExamWeakItem[]>([]);\n" +
  "  const [examDrill, setExamDrill] = useState<ExamWeakItem | null>(null);",
  "state");

// 3) refreshToday 加 examWeakList
rep(
  "    try { setWeaknesses(await api.priorityList({ limit: 3 })); } catch { /* 弱点留空 */ }\n  }, []);",
  "    try { setWeaknesses(await api.priorityList({ limit: 3 })); } catch { /* 弱点留空 */ }\n" +
  "    try { setExamWeak(await api.examWeakList({ limit: 3 })); } catch { /* 考后薄弱留空 */ }\n" +
  "  }, []);",
  "refresh");

// 4) ExamPage 接线
rep(
  '        {tab === "exam" && <ExamPage onCardsChanged={refreshCounts} onSendShadow={sendToShadow} />}',
  '        {tab === "exam" && <ExamPage\n' +
  "          onCardsChanged={refreshCounts}\n" +
  "          onSendShadow={(t) => sendToShadow(t)}\n" +
  '          onConversationDrill={(item) => { setExamDrill(item); setTab("chat"); }}\n' +
  "        />}",
  "exam render");

// 5) ConversationPage 接线
rep(
  "        {tab === \"chat\" && <ConversationPage\n" +
  "  onSendShadow={(t, opts) => sendToShadow(t, opts)}\n" +
  "  usePrompt={usePrompt}\n" +
  "  onPromptConsumed={() => setUsePrompt(null)}\n" +
  " />}",
  "        {tab === \"chat\" && <ConversationPage\n" +
  "  onSendShadow={(t, opts) => sendToShadow(t, opts)}\n" +
  "  usePrompt={usePrompt}\n" +
  "  onPromptConsumed={() => setUsePrompt(null)}\n" +
  "  examDrill={examDrill}\n" +
  "  onExamDrillConsumed={() => setExamDrill(null)}\n" +
  " />}",
  "conv render");

// 6) 今日页考后薄弱区块（插在弱点区块标题后）
rep(
  '                    <div className="today-sec-title">弱点复习 · 按重要度排序</div>',
  '                    <div className="today-sec-title">弱点复习 · 按重要度排序</div>\n' +
  "                    {examWeak.length > 0 && (\n" +
  "                      <div className=\"today-sec today-exam-weak\">\n" +
  "                        <div className=\"today-sec-title\">考后薄弱清单 · 错题演练</div>\n" +
  "                        <div className=\"today-cards\">\n" +
  "                          {examWeak.map((w) => (\n" +
  "                            <div key={w.id} className=\"tcard weak-card\">\n" +
  "                              <b className=\"wc-canon\">{w.paper_title} · 第 {w.q_index + 1} 题</b>\n" +
  "                              <span className=\"wc-gloss\">{w.point || w.reason || w.stem.slice(0, 60)}</span>\n" +
  "                              <span className=\"wc-actions\">\n" +
  "                                {w.is_listening ? (\n" +
  "                                  <button onClick={() => sendToShadow(w.stem)}>🎙 精听</button>\n" +
  "                                ) : (\n" +
  "                                  <button onClick={() => { setExamDrill(w); setTab(\"chat\"); }}>💬 对话演练</button>\n" +
  "                                )}\n" +
  "                                <button onClick={() => setTab(\"exam\")}>去错题本</button>\n" +
  "                              </span>\n" +
  "                            </div>\n" +
  "                          ))}\n" +
  "                        </div>\n" +
  "                      </div>\n" +
  "                    )}",
  "exam weak ui");

if (changed) { fs.writeFileSync(ap, s); console.log("written"); }
else console.log("no changes");
