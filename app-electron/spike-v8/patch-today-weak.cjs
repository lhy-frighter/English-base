const fs = require("fs");
const ap = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(ap, "utf8");
let changed = false;
function rep(old, neu, label) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.replace(old, neu); changed = true; console.log("patched", label);
}

// 1) import PriorityDto 类型
rep(
  'type DebriefCandidate, type TextLearnedSummary } from "./api";',
  'type DebriefCandidate, type TextLearnedSummary, type PriorityDto } from "./api";',
  "import type");

// 2) state
rep(
  "  const [useCounts, setUseCounts] = useState<{\n" +
  "    used_spontaneously: number; used_prompted: number;\n" +
  "    used_after_correction: number; recognized: number;\n" +
  "  } | null>(null);",
  "  const [useCounts, setUseCounts] = useState<{\n" +
  "    used_spontaneously: number; used_prompted: number;\n" +
  "    used_after_correction: number; recognized: number;\n" +
  "  } | null>(null);\n" +
  "  const [weaknesses, setWeaknesses] = useState<PriorityDto[]>([]);",
  "state");

// 3) refreshToday 拉弱点
rep(
  "    try { setDrafts(await api.debriefList()); } catch { /* 待复盘留空 */ }",
  "    try { setDrafts(await api.debriefList()); } catch { /* 待复盘留空 */ }\n" +
  "    try { setWeaknesses(await api.priorityList({ limit: 3 })); } catch { /* 弱点留空 */ }",
  "refresh");

// 4) UI：弱点区块（插在其他入口 section 之前）
const anchor = '                <div className="today-sec">\n' +
  '                  <div className="today-sec-title">其他入口</div>';
const neu =
  '                {weaknesses.length > 0 && (\n' +
  '                  <div className="today-sec today-weak">\n' +
  '                    <div className="today-sec-title">弱点复习 · 按重要度排序</div>\n' +
  '                    <div className="today-cards">\n' +
  '                      {weaknesses.map((w) => (\n' +
  '                        <div key={w.asset_id} className="tcard weak-card">\n' +
  '                          <b className="wc-canon">{w.canonical}</b>\n' +
  '                          <span className="wc-gloss">{w.gloss || "（无释义）"}</span>\n' +
  '                          <span className="wc-reason">{w.reasons.slice(0, 2).join(" · ")}</span>\n' +
  '                          <span className="wc-actions">\n' +
  '                            <button onClick={() => setTab("review")}>复习</button>\n' +
  '                            <button onClick={() => {\n' +
  '                              setUsePrompt({\n' +
  '                                assetId: w.asset_id, canonical: w.canonical,\n' +
  '                                kind: w.asset_kind,\n' +
  '                              });\n' +
  '                              setTab("chat");\n' +
  '                            }}>再用一次</button>\n' +
  '                          </span>\n' +
  '                        </div>\n' +
  '                      ))}\n' +
  '                    </div>\n' +
  '                  </div>\n' +
  '                )}\n\n' + anchor;
rep(anchor, neu, "ui");

if (changed) { fs.writeFileSync(ap, s); console.log("written"); }
else console.log("no changes");
