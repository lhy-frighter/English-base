// v2.15.1 书库删除入口接线：main/preload/api/App.tsx/styles.css（幂等，带断言）
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
let patched = 0;
function patchFile(rel, oldStr, newStr, label) {
  const fp = path.join(root, rel);
  let s = fs.readFileSync(fp, "utf8");
  if (s.includes(newStr)) { console.log("skip(已应用):", label); return; }
  if (!s.includes(oldStr)) throw new Error(`[${rel}] 未找到锚点: ${label}`);
  fs.writeFileSync(fp, s.replace(oldStr, newStr), "utf8");
  patched++;
  console.log("patched:", label);
}

// 1) main.cjs IPC handler
patchFile("main.cjs",
`      getText: ({ id }) => core.getText(id),
`,
`      getText: ({ id }) => core.getText(id),
      textDelete: ({ id }) => core.deleteText(id),
`,
"main.cjs textDelete");

// 2) preload bridge
patchFile("preload.cjs",
`  getText: (id) => call("getText", { id }),
`,
`  getText: (id) => call("getText", { id }),
  textDelete: (id) => call("textDelete", { id }),
`,
"preload.cjs textDelete");

// 3) api.ts type
patchFile(path.join("src", "api.ts"),
`  getText: (id: number) => Promise<{ id: number; title: string; raw_text: string }>;
`,
`  getText: (id: number) => Promise<{ id: number; title: string; raw_text: string }>;
  textDelete: (id: number) => Promise<{ deleted: boolean; notes: number; lexemesRemoved: number }>;
`,
"api.ts textDelete");

// 4a) App.tsx 删除回调（挂在 backToLibrary 之后）
patchFile(path.join("src", "App.tsx"),
`    inference.release("translation").catch(() => {});
    refreshTexts();
  }, [refreshTexts]);
`,
`    inference.release("translation").catch(() => {});
    refreshTexts();
  }, [refreshTexts]);

  // v2.15.1 书库删除文章：core 级联清理笔记/卡片/证据/来源/译文与孤儿词元；当日首启快照可回滚
  const deleteTextCard = useCallback(async (t: TextCard) => {
    if (!window.confirm(\`删除《\${t.title || "无标题"}》？\\n该文章的笔记、卡片与查词记录会一并删除（其他文章仍在用的共享词元保留）。\\n今日启动时已自动生成备份快照，可回滚。\`)) return;
    try {
      await api.textDelete(t.id);
      if (ann?.text_id === t.id) backToLibrary();
      await Promise.all([refreshTexts(), refreshCounts()]);
    } catch (e) { setErr(String(e)); }
  }, [ann, backToLibrary, refreshTexts, refreshCounts]);
`,
"App.tsx deleteTextCard 回调");

// 4b) App.tsx 卡片 JSX：button 改 div role=button + 右上角删除钮
patchFile(path.join("src", "App.tsx"),
`                    return (
                      <button key={t.id} className="lib-card" onClick={() => openSaved(t.id)}>
                        <span className="lib-title">{t.title || "无标题"}</span>
                        <span className="lib-badges">
                          <em className="src-badge">{srcLabel}</em>
                          {t.stats?.cefr && <em className="lvl">{t.stats.cefr}</em>}
                        </span>
                        <span className="lib-meta">
                          {t.stats?.words ? <span>{t.stats.words} 词</span> : <span>未统计</span>}
                          {t.stats?.words ? <span>旧词 {t.stats.rate}%</span> : null}
                          {t.stats?.awlRate ? <span>学术 {t.stats.awlRate}%</span> : null}
                          {t.lookups > 0 && <span className="lib-lookups">查词 {t.lookups}</span>}
                        </span>
                        <span className="lib-date">{fmtDate(t.created_at)}</span>
                      </button>
                    );`,
`                    return (
                      <div key={t.id} className="lib-card" role="button" tabIndex={0}
                        onClick={() => openSaved(t.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSaved(t.id); } }}>
                        <span className="lib-title">{t.title || "无标题"}</span>
                        <span className="lib-badges">
                          <em className="src-badge">{srcLabel}</em>
                          {t.stats?.cefr && <em className="lvl">{t.stats.cefr}</em>}
                        </span>
                        <span className="lib-meta">
                          {t.stats?.words ? <span>{t.stats.words} 词</span> : <span>未统计</span>}
                          {t.stats?.words ? <span>旧词 {t.stats.rate}%</span> : null}
                          {t.stats?.awlRate ? <span>学术 {t.stats.awlRate}%</span> : null}
                          {t.lookups > 0 && <span className="lib-lookups">查词 {t.lookups}</span>}
                        </span>
                        <span className="lib-date">{fmtDate(t.created_at)}</span>
                        <button type="button" className="lib-del" title="删除文章"
                          onClick={(e) => { e.stopPropagation(); deleteTextCard(t); }}>×</button>
                      </div>
                    );`,
"App.tsx 卡片 JSX");

// 5) styles.css：卡片相对定位+右侧留白+删除钮样式
patchFile(path.join("src", "styles.css"),
`.lib-card {
  text-align: left; padding: 14px 16px; border-radius: 12px;
  background: var(--surface); border: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 8px; min-height: 118px;
  box-shadow: 0 1px 2px rgba(28, 43, 58, 0.04);
}
.lib-card:hover { border-color: var(--brass); background: var(--brass-wash); }`,
`.lib-card {
  position: relative; cursor: pointer;
  text-align: left; padding: 14px 32px 14px 16px; border-radius: 12px;
  background: var(--surface); border: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 8px; min-height: 118px;
  box-shadow: 0 1px 2px rgba(28, 43, 58, 0.04);
}
.lib-card:hover { border-color: var(--brass); background: var(--brass-wash); }
.lib-del {
  position: absolute; top: 6px; right: 8px; width: 22px; height: 22px;
  border: none; border-radius: 6px; background: transparent; color: #a3a89b;
  font-size: 16px; line-height: 1; cursor: pointer; padding: 0;
  opacity: 0; transition: opacity .15s, background .15s, color .15s;
}
.lib-card:hover .lib-del, .lib-del:focus-visible { opacity: 1; }
.lib-del:hover { background: rgba(176, 65, 62, 0.12); color: #b0413e; }`,
"styles.css lib-del");

console.log(`完成，${patched} 处落盘`);
