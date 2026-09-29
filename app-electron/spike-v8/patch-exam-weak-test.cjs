const fs = require("fs");
const tp = "D:/vibe coding/英语学习/app-electron/test/debrief.cjs";
let s = fs.readFileSync(tp, "utf8");
if (s.indexOf("9.1") !== -1) { console.log("already"); process.exit(0); }
const anchor = "console.log(`\\ndebrief: ${pass} passed, ${fail} failed`);";
if (s.indexOf(anchor) === -1) throw new Error("anchor missing");
const add =
"// 9.1 考试错题跨域：听力/阅读错题进薄弱清单，字段与题型正确\n" +
"const CROSS_MD = `# 跨域错题卷\n" +
"::meta kind=cet6\n" +
"## Listening\n" +
"::kind listening\n" +
"[00:03] M: I would like a ticket please.\n" +
"### Q1\n" +
"What does the man want?\n" +
"- A) A ticket\n" +
"- B) A refund\n" +
"- C) A map\n" +
"- D) A seat\n" +
"> answer: A\n" +
"> point: 听力细节\n" +
"## Reading\n" +
"The committee published a new regulation on campus parking.\n" +
"### Q2\n" +
"The word regulation is closest in meaning to ___.\n" +
"- A) ceremony\n" +
"- B) rule\n" +
"- C) product\n" +
"- D) subsidy\n" +
"> answer: B\n" +
"> point: 词汇题\n" +
"`;\n" +
"const crossImp = core.importPaper(CROSS_MD);\n" +
"check(" +
"  " +
"\"两题解析入库\", crossImp.nQuestions === 2, String(crossImp.nQuestions));\n" +
"core.gradeAttempt(crossImp.id, { 0: \"B\", 1: \"A\" }, Date.now());\n" +
"const weak = core.examWeakList({ limit: 5 });\n" +
"check(\"薄弱清单收 2 题\", weak.length === 2, String(weak.length));\n" +
"const wLis = weak.find((w) => w.is_listening);\n" +
"const wRead = weak.find((w) => !w.is_listening);\n" +
"check(\"听力题识别为 listening\", !!wLis && wLis.section_kind.includes(\"listen\"),\n" +
"  JSON.stringify(weak.map((w) => w.section_kind)));\n" +
"check(\"阅读题非 listening\", !!wRead && !wRead.is_listening);\n" +
"check(\"题干/答案/考点带出\",\n" +
"  wLis.stem.includes(\"ticket\") && wLis.answer === \"A\" && wLis.point.includes(\"听力\"),\n" +
"  JSON.stringify([wLis.stem, wLis.answer, wLis.point]));\n" +
"check(\"阅读题字段带出\",\n" +
"  wRead.stem.includes(\"regulation\") && wRead.answer === \"B\" && wRead.point.includes(\"词汇\"));\n" +
"check(\"limit 生效\", core.examWeakList({ limit: 1 }).length === 1);\n\n";
s = s.replace(anchor, add + anchor);
fs.writeFileSync(tp, s);
console.log("patched");
