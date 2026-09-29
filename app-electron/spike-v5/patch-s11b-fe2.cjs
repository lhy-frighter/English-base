// S11-b 前端 v2：回收页 + 今日次级卡 + 词库入口（大段 JSX 从 recycle-page.tsx.txt 读取）
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const fp = path.join(root, "src", "App.tsx");
let s = fs.readFileSync(fp, "utf8");
function rep(oldStr, newStr, label) {
  if (s.includes(newStr)) { console.log("skip:", label); return; }
  if (!s.includes(oldStr)) throw new Error("锚点缺失: " + label);
  s = s.replace(oldStr, newStr); console.log("patched:", label);
}

rep(
`type TextSourceKind, type TodayBrief } from "./api";`,
`type TextSourceKind, type TodayBrief, type RecycleItem } from "./api";`,
"类型导入");

rep(
`const [tab, setTab] = useState<"today" | "read" | "feed" | "review" | "shadow" | "lex" | "syl" | "exam" | "dash" | "voice">("today");`,
`const [tab, setTab] = useState<"today" | "read" | "feed" | "review" | "shadow" | "lex" | "syl" | "exam" | "dash" | "voice" | "recycle">("today");`,
"tab 类型");

rep(
`  const [today, setToday] = useState<TodayBrief | null>(null);`,
`  const [today, setToday] = useState<TodayBrief | null>(null);
  // S11-b 漏网词回收
  const [recycleItems, setRecycleItems] = useState<RecycleItem[]>([]);
  const [recycleTotal, setRecycleTotal] = useState(0);
  const [recycleMultiOnly, setRecycleMultiOnly] = useState(true);
  const [recycleSel, setRecycleSel] = useState<Set<string>>(new Set());
  const [recycleBusy, setRecycleBusy] = useState(false);
  const [recycleMsg, setRecycleMsg] = useState("");
  const RECYCLE_PAGE = 50;`,
"回收状态");

rep(
`  useEffect(() => { if (tab === "today") void refreshToday(); }, [tab, refreshToday]);`,
`  useEffect(() => { if (tab === "today") void refreshToday(); }, [tab, refreshToday]);

  const loadRecycle = useCallback(async (multiOnly: boolean, append = false) => {
    try {
      const r = await api.recycleCandidates({
        minTexts: multiOnly ? 2 : 1, limit: RECYCLE_PAGE,
        offset: append ? recycleItems.length : 0,
      });
      setRecycleItems((prev) => append ? [...prev, ...r.items] : r.items);
      setRecycleTotal(r.total);
    } catch (e) { setErr(String(e)); }
  }, [recycleItems.length]);
  const openRecycle = useCallback(() => {
    setTab("recycle"); setRecycleMsg(""); setRecycleSel(new Set());
    void loadRecycle(recycleMultiOnly);
  }, [recycleMultiOnly, loadRecycle]);
  const recycleAdd = useCallback(async (lemmas: string[]) => {
    if (!lemmas.length) return;
    setRecycleBusy(true);
    try {
      const r = await api.recycleAdd(lemmas);
      setRecycleMsg(\`已加入复习 \${r.added.length} 个词\`
        + (r.already.length ? \`，\${r.already.length} 个已在词库\` : "")
        + (r.skipped.length ? \`，跳过 \${r.skipped.length} 个\` : ""));
      setRecycleSel(new Set());
      await loadRecycle(recycleMultiOnly);
      void refreshCounts(); void refreshToday();
    } catch (e) { setErr(String(e)); }
    finally { setRecycleBusy(false); }
  }, [recycleMultiOnly, loadRecycle, refreshCounts, refreshToday]);`,
"回收动作");

rep(
`                    <button className="tcard" onClick={() => setTab("feed")}>
                      <b>每日好文</b>
                      <span>按当前水平推荐的新文章</span>
                    </button>`,
`                    {(today.recycle_multi ?? 0) > 0 && (
                      <button className="tcard" onClick={openRecycle}>
                        <b>漏网词回收</b>
                        <span>{today.recycle_multi} 个词在多篇文章反复遇到，还没进词卡</span>
                      </button>
                    )}
                    <button className="tcard" onClick={() => setTab("feed")}>
                      <b>每日好文</b>
                      <span>按当前水平推荐的新文章</span>
                    </button>`,
"今日次级卡");

rep(
`              <h2>词库</h2>
              <input className="syl-search" value={lexQ}`,
`              <h2>词库</h2>
              <button className="btn-mini recycle-entry" onClick={openRecycle}
                title="阅读中反复遇到、但还没建卡的词">
                漏网词{(today?.recycle_multi ?? 0) > 0 ? " · " + (today.recycle_multi ?? 0) : ""}
              </button>
              <input className="syl-search" value={lexQ}`,
"词库入口");

const page = fs.readFileSync(path.join(__dirname, "recycle-page.tsx.txt"), "utf8").replace(/\s+$/, "") + "\n";
const anchor7 = `        {/* ============ 阅读：书库 ============ */}`;
if (!s.includes("S11-b 漏网词回收")) {
  if (!s.includes(anchor7)) throw new Error("锚点缺失: 回收页");
  s = s.replace(anchor7, page);
  console.log("patched: 回收页 JSX");
} else console.log("skip: 回收页 JSX");

fs.writeFileSync(fp, s, "utf8");
console.log("App.tsx saved");

const cssFp = path.join(root, "src", "styles.css");
let css = fs.readFileSync(cssFp, "utf8");
if (!css.includes("recycle-page")) {
  css += `
/* S11-b 漏网词回收 */
.recycle-entry { margin-left: 8px; white-space: nowrap; }
.recycle-hint { margin: 4px 0 12px; font-size: 13px; line-height: 1.6; }
.recycle-msg { background: rgba(184, 134, 75, .12); border: 1px solid rgba(184, 134, 75, .4);
  color: #8a5a2b; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; font-size: 13px; }
.recycle-list { display: flex; flex-direction: column; gap: 8px; }
.recycle-row { display: flex; gap: 12px; align-items: flex-start; padding: 10px 14px;
  border: 1px solid var(--border, #e3ddd2); border-radius: 10px; background: var(--card, #fffdf8);
  cursor: pointer; transition: border-color .15s, background .15s; }
.recycle-row:hover { border-color: #c9a878; }
.recycle-row.sel { border-color: #b8864b; background: rgba(184, 134, 75, .08); }
.recycle-row input[type="checkbox"] { margin-top: 4px; width: 16px; height: 16px; accent-color: #b8864b; }
.rr-main { flex: 1; min-width: 0; }
.rr-word { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rr-word b { font-size: 16px; }
.rr-phon { color: #9a8f7d; font-size: 12px; }
.rr-gloss { margin-top: 3px; font-size: 13px; color: #4a4438; }
.rr-src { margin-top: 4px; font-size: 12px; color: #9a8f7d; }
.lvl-badge.lv-awl { background: #e7eef5; color: #3a638f; }
.rr-more { display: block; margin: 14px auto 0; }
`;
  fs.writeFileSync(cssFp, css, "utf8");
  console.log("styles saved");
} else console.log("skip: styles");
