const fs = require("fs");
const ap = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(ap, "utf8");
let changed = false;
function mustInsert(anchor, add, label) {
  const i = s.indexOf(anchor);
  if (i === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(add) !== -1) { console.log("skip", label); return; }
  s = s.slice(0, i + anchor.length) + add + s.slice(i + anchor.length);
  changed = true;
  console.log("insert", label);
}

// A. 组件 import
mustInsert(
  'import { AssetCaptureSheet } from "./components/AssetCaptureSheet";',
  '\nimport { DebriefPanel, type DebriefContext } from "./components/DebriefPanel";',
  "import DebriefPanel");

// A2. api 类型 import：在 TodayBrief 后补类型
mustInsert(
  'type TodayBrief, type RecycleItem } from "./api";',
  '',
  "noop");
// 上面锚点若存在则替换为带新类型版本（单独处理）
{
  const oldImp = 'type TodayBrief, type RecycleItem } from "./api";';
  const newImp = 'type TodayBrief, type RecycleItem, type DebriefDraft, type DebriefCandidate, type TextLearnedSummary } from "./api";';
  if (s.indexOf(oldImp) !== -1 && s.indexOf(newImp) === -1) {
    s = s.replace(oldImp, newImp); changed = true; console.log("insert api types");
  }
}

// B. state
mustInsert(
  '  const [today, setToday] = useState<TodayBrief | null>(null);',
  '\n  const [drafts, setDrafts] = useState<DebriefDraft[]>([]);\n' +
  '  const [debrief, setDebrief] = useState<{ ctx: DebriefContext; initial: DebriefCandidate[] } | null>(null);\n' +
  '  const [learnedSummary, setLearnedSummary] = useState<TextLearnedSummary | null>(null);',
  "state");

// C. refreshToday 同时拉草稿
mustInsert(
  '    try { setToday(await api.todayBrief()); } catch { /* 今日页留空，不阻塞 */ }',
  '\n    try { setDrafts(await api.debriefList()); } catch { /* 待复盘留空 */ }',
  "refresh drafts");

// D. learnedSummary effect
mustInsert(
  '  const annTextId = ann?.text_id ?? null;',
  '\n  useEffect(() => {\n' +
  '    setLearnedSummary(null);\n' +
  '    if (annTextId == null) return;\n' +
  '    let alive = true;\n' +
  '    api.textLearnedSummary(annTextId)\n' +
  '      .then((r) => { if (alive) setLearnedSummary(r); })\n' +
  '      .catch(() => {});\n' +
  '    return () => { alive = false; };\n' +
  '  }, [annTextId]);',
  "learned summary effect");

// E. backToLibrary：离开前持久化复盘候选
{
  const oldFn =
    '  const backToLibrary = useCallback(() => {\n' +
    '    setAnn(null); setText(""); setEntry(null); setEntryStart(0); setEntryKey(""); setCreateMsg(""); setComposing(false);\n' +
    '    setSelTrans(null); setSelText(""); setRawText(""); setMt(null); setMtBusy(null); setMtErr(""); mtRunRef.current++;\n' +
    '    inference.release("translation").catch(() => {});\n' +
    '    refreshTexts();\n' +
    '  }, [refreshTexts]);';
  const newFn =
    '  const backToLibrary = useCallback(() => {\n' +
    '    const tid = ann?.text_id ?? null;\n' +
    '    if (tid != null) {\n' +
    '      api.textDebriefCandidates(tid).then((cs) => {\n' +
    '        if (cs.length) return api.debriefPut({ origin_kind: "reading", origin_ref: String(tid), candidates: cs });\n' +
    '      }).catch(() => {});\n' +
    '    }\n' +
    '    setAnn(null); setText(""); setEntry(null); setEntryStart(0); setEntryKey(""); setCreateMsg(""); setComposing(false);\n' +
    '    setSelTrans(null); setSelText(""); setRawText(""); setMt(null); setMtBusy(null); setMtErr(""); mtRunRef.current++;\n' +
    '    inference.release("translation").catch(() => {});\n' +
    '    refreshTexts();\n' +
    '    api.debriefList().then(setDrafts).catch(() => {});\n' +
    '  }, [ann, refreshTexts]);';
  if (s.indexOf(oldFn) === -1) throw new Error("backToLibrary anchor missing");
  if (s.indexOf(newFn) === -1) { s = s.replace(oldFn, newFn); changed = true; console.log("patch backToLibrary"); }
}

// F. openTextDebrief / openDraftDebrief
mustInsert(
  '  // v2.15.1 书库删除文章：',
  '  // S13-a-2 复盘：手动复盘本文\n' +
  '  const openTextDebrief = useCallback(async (tid: number) => {\n' +
  '    try {\n' +
  '      const cs = await api.textDebriefCandidates(tid);\n' +
  '      if (!cs.length) { setErr("没有需要复盘的内容（查过的词都已建卡）"); return; }\n' +
  '      const title = texts.find((t) => t.id === tid)?.title || "文章";\n' +
  '      setDebrief({ ctx: { originKind: "reading", originRef: String(tid), title }, initial: cs });\n' +
  '    } catch (e) { setErr(String(e)); }\n' +
  '  }, [texts]);\n\n' +
  '  const openDraftDebrief = useCallback((d: DebriefDraft) => {\n' +
  '    let cs: DebriefCandidate[] = [];\n' +
  '    try { cs = JSON.parse(d.candidates_json) as DebriefCandidate[]; } catch { cs = []; }\n' +
  '    if (!cs.length) { void api.debriefSetStatus(d.draft_key, "skipped"); return; }\n' +
  '    const title = d.origin_kind === "reading"\n' +
  '      ? (texts.find((t) => String(t.id) === d.origin_ref)?.title || "文章")\n' +
  '      : d.origin_kind === "conversation" ? "对话复盘" : "复盘";\n' +
  '    setDebrief({\n' +
  '      ctx: {\n' +
  '        originKind: d.origin_kind, originRef: d.origin_ref, title,\n' +
  '        sessionKey: d.origin_kind === "conversation" ? d.origin_ref : undefined,\n' +
  '      },\n' +
  '      initial: cs,\n' +
  '    });\n' +
  '  }, [texts]);\n\n',
  "debrief callbacks");

// G. 阅读头部：反向视图 chips + 复盘按钮
mustInsert(
  '              <button className="ghost2" onClick={backToLibrary}>← 书库</button>',
  '\n' +
  '              {learnedSummary && (\n' +
  '                <span className="muted learned-map">\n' +
  '                  本文已学 <b>{learnedSummary.words}</b> 词\n' +
  '                  {((learnedSummary.assets.chunk || 0) + (learnedSummary.assets.grammar || 0) +\n' +
  '                    (learnedSummary.assets.pronunciation || 0) + (learnedSummary.assets.concept || 0)) > 0 ? (\n' +
  '                    <> · <b>{\n' +
  '                      (learnedSummary.assets.chunk || 0) + (learnedSummary.assets.grammar || 0) +\n' +
  '                      (learnedSummary.assets.pronunciation || 0) + (learnedSummary.assets.concept || 0)\n' +
  '                    }</b> 项资产</>\n' +
  '                  ) : null}\n' +
  '                  {learnedSummary.shadow_pass > 0 ? <> · <b>{learnedSummary.shadow_pass}</b> 句跟读通过</> : null}\n' +
  '                </span>\n' +
  '              )}\n' +
  '              <button className="ghost2" title="把本文查过但还没建卡的词批量加入复习"\n' +
  '                onClick={() => { void openTextDebrief(ann!.text_id); }}>复盘本文</button>',
  "reader header");

// H. 今日页：待复盘区块
mustInsert(
  '                <div className="today-sec">\n' +
  '                  <div className="today-sec-title">其他入口</div>',
  '                {drafts.length > 0 && (\n' +
  '                  <div className="today-sec today-debrief">\n' +
  '                    <div className="today-sec-title">待复盘</div>\n' +
  '                    <div className="today-cards">\n' +
  '                      {drafts.map((d) => (\n' +
  '                        <button key={d.draft_key} className="tcard" onClick={() => openDraftDebrief(d)}>\n' +
  '                          <b>{d.origin_kind === "reading" ? "文章复盘" : d.origin_kind === "conversation" ? "对话复盘" : "复盘"}</b>\n' +
  '                          <span>{(() => { let cnt = 0; try { cnt = (JSON.parse(d.candidates_json) as unknown[]).length; } catch { /* 0 */ } return cnt; })()} 项收获待确认</span>\n' +
  '                        </button>\n' +
  '                      ))}\n' +
  '                    </div>\n' +
  '                  </div>\n' +
  '                )}\n',
  "today debrief block");

// I. 渲染 DebriefPanel
mustInsert(
  '          onWord={async (word, sentence) => api.createShadowNote({ word, sentence })}\n' +
  '        />\n' +
  '      </main>',
  '        {debrief && (\n' +
  '          <DebriefPanel\n' +
  '            ctx={debrief.ctx}\n' +
  '            initial={debrief.initial}\n' +
  '            onClose={() => setDebrief(null)}\n' +
  '            onAfter={() => {\n' +
  '              api.debriefList().then(setDrafts).catch(() => {});\n' +
  '              refreshCounts();\n' +
  '            }}\n' +
  '          />\n' +
  '        )}\n',
  "render DebriefPanel");

if (changed) { fs.writeFileSync(ap, s); console.log("App.tsx written"); }
else console.log("no changes");
