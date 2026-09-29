const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/src/shadow/ShadowPage.tsx";
let s = fs.readFileSync(cp, "utf8");
let changed = false;
function rep(old, neu, label) {
  if (s.indexOf(old) === -1) throw new Error("anchor missing: " + label);
  if (s.indexOf(neu) !== -1) { console.log("skip", label); return; }
  s = s.replace(old, neu); changed = true; console.log("patched", label);
}

// 1) sourceRef 类型
rep(
  "  const sourceRef = useRef<{ textId?: number; title?: string } | null>(null);",
  "  const sourceRef = useRef<{\n" +
  "    textId?: number; title?: string;\n" +
  "    originKind?: string; originRef?: string;\n" +
  "  } | null>(null);",
  "ref type");

// 2) send effect 赋值
rep(
  "    sourceRef.current = send.textId != null ? { textId: send.textId, title: send.title } : null;",
  "    sourceRef.current = {\n" +
  "      textId: send.textId, title: send.title,\n" +
  "      originKind: send.originKind, originRef: send.originRef,\n" +
  "    };",
  "send effect");

// 3) shadowPractice 传 origin
rep(
  "            textId: sourceRef.current?.textId ?? null,\n" +
  "            title: sourceRef.current?.title ?? \"\",\n" +
  "            similarity: Math.round(aligned.similarity * 100),\n" +
  "          }).then((pr: ShadowPracticeResult) => {",
  "            textId: sourceRef.current?.textId ?? null,\n" +
  "            title: sourceRef.current?.title ?? \"\",\n" +
  "            similarity: Math.round(aligned.similarity * 100),\n" +
  "            originKind: sourceRef.current?.originKind || \"reading\",\n" +
  "            originRef: sourceRef.current?.originRef || \"\",\n" +
  "          }).then((pr: ShadowPracticeResult) => {",
  "practice call");

// 4) graduated 文案
rep(
  '            setSchedNote(pr.graduated\n' +
  '              ? "本句已完成 1/3/7 全部续练，不再提醒"',
  '            setSchedNote(pr.graduated\n' +
  '              ? "✓ 已跟读通过：1/3/7 全部完成，来源句已标记"',
  "graduated note");

if (changed) { fs.writeFileSync(cp, s); console.log("written"); }
else console.log("no changes");
