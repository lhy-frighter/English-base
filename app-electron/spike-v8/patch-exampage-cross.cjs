const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/src/ExamPage.tsx";
let s = fs.readFileSync(cp, "utf8");
let changed = false;
function rep(old, neu, label) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.replace(old, neu); changed = true; console.log("patched", label);
}

// 1) import ExamWeakItem
rep(
  "  type PaperListItem, type PaperDetail, type GradeResult, type WrongItem, type PaperCue,\n} from \"./api\";",
  "  type PaperListItem, type PaperDetail, type GradeResult, type WrongItem, type PaperCue,\n" +
  "  type ExamWeakItem,\n} from \"./api\";",
  "import");

// 2) 组件签名加 onConversationDrill
rep(
  "export function ExamPage({ onCardsChanged, onSendShadow }: { onCardsChanged: () => void; onSendShadow?: (t: string) => void }) {",
  "export function ExamPage({ onCardsChanged, onSendShadow, onConversationDrill }: {\n" +
  "  onCardsChanged: () => void;\n" +
  "  onSendShadow?: (t: string) => void;\n" +
  "  onConversationDrill?: (item: ExamWeakItem) => void; }) {",
  "signature");

// 3) wrong-actions 加跨域按钮（在「转为练习」后）
rep(
  "                <button className=\"primary\" onClick={() => redo(w)}>提交重做</button>\n" +
  "                <button className=\"ghost2\" onClick={() => setCapW(w)}>转为练习</button>\n",
  "                <button className=\"primary\" onClick={() => redo(w)}>提交重做</button>\n" +
  "                <button className=\"ghost2\" onClick={() => setCapW(w)}>转为练习</button>\n" +
  "                {String(w.question!.section_kind || \"\").toLowerCase().includes(\"listen\") ? (\n" +
  "                  <button className=\"ghost2\"\n" +
  "                    onClick={() => onSendShadow?.(w.question!.stem)}>🎙 送跟读台精听</button>\n" +
  "                ) : (\n" +
  "                  <button className=\"ghost2\"\n" +
  "                    onClick={() => onConversationDrill?.({\n" +
  "                      id: w.id, paper_id: w.paper_id, q_index: w.q_index,\n" +
  "                      paper_title: w.paper_title, reason: w.reason,\n" +
  "                      stem: w.question!.stem,\n" +
  "                      section_kind: w.question!.section_kind || \"\",\n" +
  "                      answer: w.question!.answer || \"\",\n" +
  "                      point: w.question!.point || \"\",\n" +
  "                      is_listening: false,\n" +
  "                    })}>💬 对话演练</button>\n" +
  "                )}\n",
  "actions");

if (changed) { fs.writeFileSync(cp, s); console.log("written"); }
else console.log("no changes");
