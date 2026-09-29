const fs = require("fs");
const cp = "D:/vibe coding/英语学习/app-electron/core.cjs";
let s = fs.readFileSync(cp, "utf8");
if (s.indexOf("examWeakList(") !== -1) { console.log("already"); process.exit(0); }
const anchor = "  listWrong(state = \"active\") {";
const i = s.indexOf(anchor);
if (i === -1) throw new Error("anchor missing");
const add =
"  // S13-d-2 考后薄弱清单：active 错题，带题干/题型，供今日页与对话演练\n" +
"  examWeakList({ limit = 3 } = {}) {\n" +
"    const n = Math.max(1, Math.min(20, Number(limit) || 3));\n" +
"    const rows = this.user.prepare(\n" +
"      `SELECT wq.id, wq.paper_id, wq.q_index, wq.reason, wq.next_review,\n" +
"              p.title AS paper_title, p.struct_json\n" +
"         FROM wrong_questions wq\n" +
"         JOIN papers p ON p.id=wq.paper_id\n" +
"        WHERE wq.state='active'\n" +
"        ORDER BY wq.next_review DESC, wq.id DESC LIMIT ?`).all(n);\n" +
"    return rows.map((r) => {\n" +
"      let stem = \"\", sectionKind = \"\", answer = \"\", point = \"\";\n" +
"      try {\n" +
"        const st = JSON.parse(r.struct_json);\n" +
"        const sections = Array.isArray(st) ? st : (st.sections || []);\n" +
"        outer: for (const sec of sections) {\n" +
"          for (const q0 of sec.questions || []) {\n" +
"            if (q0.index === r.q_index) {\n" +
"              stem = q0.stem || \"\";\n" +
"              sectionKind = q0.section_kind || sec.kind || \"\";\n" +
"              answer = q0.answer || \"\";\n" +
"              point = q0.point || \"\";\n" +
"              break outer;\n" +
"            }\n" +
"          }\n" +
"        }\n" +
"      } catch {}\n" +
"      const k = String(sectionKind).toLowerCase();\n" +
"      return {\n" +
"        id: r.id,\n" +
"        paper_id: r.paper_id,\n" +
"        q_index: r.q_index,\n" +
"        paper_title: r.paper_title,\n" +
"        reason: r.reason,\n" +
"        stem,\n" +
"        section_kind: k,\n" +
"        answer,\n" +
"        point,\n" +
"        is_listening: k.includes(\"listen\"),\n" +
"      };\n" +
"    });\n" +
"  }\n\n";
s = s.slice(0, i) + add + s.slice(i);
fs.writeFileSync(cp, s);
console.log("patched");
