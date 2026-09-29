const fs = require("fs");
const ap = "D:/vibe coding/英语学习/app-electron/src/App.tsx";
let s = fs.readFileSync(ap, "utf8");
let changed = false;
function rep(old, neu, label) {
  const i = s.indexOf(old);
  if (i === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.slice(0, i) + neu + s.slice(i + old.length); changed = true;
  console.log("patched", label);
}

// A. state + sendToShadow
rep(
  "  const [shadowSend, setShadowSend] = useState<{ text: string; nonce: number; textId?: number; title?: string } | null>(null);\n" +
  "  const nonceRef = useRef(createNonce());\n" +
  "  const sendToShadow = (text: string, textId?: number, title?: string) => {\n" +
  "    const t = text.trim();\n" +
  "    if (!t) return;\n" +
  "    setShadowSend({ text: t, nonce: nonceRef.current(), textId, title });\n" +
  "    setTab(\"shadow\");\n" +
  "  };",
  "  const [shadowSend, setShadowSend] = useState<{\n" +
  "    text: string; nonce: number; textId?: number; title?: string;\n" +
  "    originKind?: string; originRef?: string;\n" +
  "  } | null>(null);\n" +
  "  const nonceRef = useRef(createNonce());\n" +
  "  const sendToShadow = (\n" +
  "    text: string,\n" +
  "    opts?: { textId?: number; title?: string; originKind?: string; originRef?: string },\n" +
  ") => {\n" +
  "    const t = text.trim();\n" +
  "    if (!t) return;\n" +
  "    setShadowSend({\n" +
  "      text: t, nonce: nonceRef.current(),\n" +
  "      textId: opts?.textId, title: opts?.title,\n" +
  "      originKind: opts?.originKind, originRef: opts?.originRef,\n" +
  "    });\n" +
  "    setTab(\"shadow\");\n" +
  "  };",
  "state/send");

// B. passMap + readerSentences（插在 readerParas memo 后）
rep(
  "  const readerParas = useMemo(() => (ann ? paragraphsFromAnn(ann, rawText) : []), [ann, rawText]);",
  "  const readerParas = useMemo(() => (ann ? paragraphsFromAnn(ann, rawText) : []), [ann, rawText]);\n\n" +
  "  // S13-d-1 句子跟读通过标记（按句文本匹配，来源删除不影响）\n" +
  "  const [shadowPassMap, setShadowPassMap] = useState<Record<string, boolean>>({});\n" +
  "  const readerSentences = useMemo(() => {\n" +
  "    const out = [];\n" +
  "    for (const p of readerParas) {\n" +
  "      const ms = p.match(/\\S.*?(?:[.!?](?=\\s|$)|$)/g) || [];\n" +
  "      for (const m of ms) {\n" +
  "        const t = m.trim();\n" +
  "        if (t) out.push(t);\n" +
  "      }\n" +
  "    }\n" +
  "    return out;\n" +
  "  }, [readerParas]);\n" +
  "  useEffect(() => {\n" +
  "    let alive = true;\n" +
  "    if (!readerSentences.length) { setShadowPassMap({}); return; }\n" +
  "    api.shadowPassedForSentences(readerSentences).then((flags) => {\n" +
  "      if (!alive) return;\n" +
  "      const map = {};\n" +
  "      flags.forEach((f, i) => {\n" +
  "        if (f) map[readerSentences[i].replace(/\\s+/g, \" \").trim()] = true;\n" +
  "      });\n" +
  "      setShadowPassMap(map);\n" +
  "    }).catch(() => {});\n" +
  "    return () => { alive = false; };\n" +
  "  }, [readerSentences]);",
  "pass map");

// C. 渲染按句分组
rep(
  "                return paras.map((ptoks, pi) => (\n" +
  "                  <p key={pi} data-pi={pi} className=\"rpara\">\n" +
  "                    {ptoks.map((tk) =>\n" +
  "                      tk.label === \"punct\" ? (\n" +
  "                        <span key={tk.i} className=\"tkp\">{tk.text}</span>\n" +
  "                      ) : (\n" +
  "                        <span key={tk.i}\n" +
  "                          className={`tk ${LABEL_CLASS[tk.label] ?? \"\"}${tk.learned ? \" learned\" : \"\"}${tk.awl ? \" awl\" : \"\"} clickable`}\n" +
  "                          onClick={() => lookup(tk)} title={tk.awl ? `AWL 学术词 · 子表 ${tk.awl}` + (tk.learned ? \" · 已学\" : \"\") : tk.learned ? \"已学 · \" + tk.label : tk.label}>\n" +
  "                          {tk.text}\n" +
  "                        </span>\n" +
  "                      )\n" +
  "                    )}\n" +
  "                    {transOn && trans && trans[pi] && trans[pi].zh && (\n" +
  "                      <span className=\"zh-para\">{mt && <i className=\"mt-tag\">机翻参考</i>}{trans[pi].zh}</span>\n" +
  "                    )}\n" +
  "                  </p>\n" +
  "                ));",
  "                return paras.map((ptoks, pi) => {\n" +
  "                  const groups = [];\n" +
  "                  let cur = [];\n" +
  "                  for (const tk of ptoks) {\n" +
  "                    cur.push(tk);\n" +
  "                    if (tk.label === \"punct\" && /[.!?]/.test(tk.text)) {\n" +
  "                      groups.push(cur); cur = [];\n" +
  "                    }\n" +
  "                  }\n" +
  "                  if (cur.length) groups.push(cur);\n" +
  "                  return (\n" +
  "                  <p key={pi} data-pi={pi} className=\"rpara\">\n" +
  "                    {groups.map((gtoks, gi) => {\n" +
  "                      const gtext = gtoks.map((tk) => tk.text).join(\"\").replace(/\\s+/g, \" \").trim();\n" +
  "                      const passed = shadowPassMap[gtext];\n" +
  "                      return (\n" +
  "                        <span key={gi} className=\"sent-g\">\n" +
  "                          {gtoks.map((tk) =>\n" +
  "                            tk.label === \"punct\" ? (\n" +
  "                              <span key={tk.i} className=\"tkp\">{tk.text}</span>\n" +
  "                            ) : (\n" +
  "                              <span key={tk.i}\n" +
  "                                className={`tk ${LABEL_CLASS[tk.label] ?? \"\"}${tk.learned ? \" learned\" : \"\"}${tk.awl ? \" awl\" : \"\"} clickable`}\n" +
  "                                onClick={() => lookup(tk)} title={tk.awl ? `AWL 学术词 · 子表 ${tk.awl}` + (tk.learned ? \" · 已学\" : \"\") : tk.learned ? \"已学 · \" + tk.label : tk.label}>\n" +
  "                                {tk.text}\n" +
  "                              </span>\n" +
  "                            )\n" +
  "                          )}\n" +
  "                          {passed && <i className=\"shadow-pass\" title=\"已跟读通过\">✓</i>}\n" +
  "                        </span>\n" +
  "                      );\n" +
  "                    })}\n" +
  "                    {transOn && trans && trans[pi] && trans[pi].zh && (\n" +
  "                      <span className=\"zh-para\">{mt && <i className=\"mt-tag\">机翻参考</i>}{trans[pi].zh}</span>\n" +
  "                    )}\n" +
  "                  </p>\n" +
  "                  );\n" +
  "                });",
  "render groups");

// D. 送跟读调用
rep(
  '<button className="primary" onClick={() => sendToShadow(selText, ann?.text_id)}>送跟读 →</button>',
  '<button className="primary" onClick={() => sendToShadow(selText, { textId: ann?.text_id })}>送跟读 →</button>',
  "strip call");

// E. ConversationPage 回调
rep(
  "        {tab === \"chat\" && <ConversationPage\n" +
  "  onSendShadow={(t) => sendToShadow(t)}\n" +
  "  usePrompt={usePrompt}\n" +
  "  onPromptConsumed={() => setUsePrompt(null)}\n" +
  " />}",
  "        {tab === \"chat\" && <ConversationPage\n" +
  "  onSendShadow={(t, opts) => sendToShadow(t, opts)}\n" +
  "  usePrompt={usePrompt}\n" +
  "  onPromptConsumed={() => setUsePrompt(null)}\n" +
  " />}",
  "conv callback");

if (changed) { fs.writeFileSync(ap, s); console.log("written"); }
else console.log("no changes");
