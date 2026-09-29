const { Core } = require("../core.cjs");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s12dbg-"));
const core = new Core(dir);
const st = core.assessmentStart("b2-general");
const bank = require("../data/assessment-bank.json");
const fd = bank.forms.find((f) => f.id === st.form_id);
const r1 = core.assessmentFinish({ form_id: st.form_id, active_ms: 200000, answers: fd.questions.map((q) => q.answer) });
console.log("first:", r1.score);
console.log("raw settings:", core.user.prepare("SELECT * FROM app_settings").all());
console.log("used set:", [...core._usedAssessments()]);
try {
  core.assessmentFinish({ form_id: st.form_id, active_ms: 200000, answers: fd.questions.map((q) => q.answer) });
  console.log("second did NOT throw");
} catch (e) { console.log("second threw:", e.message); }
core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
