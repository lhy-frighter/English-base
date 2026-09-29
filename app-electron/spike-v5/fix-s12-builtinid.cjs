const fs = require("fs");
// core 返回 builtin_id
{
  const fp = "core.cjs";
  let s = fs.readFileSync(fp, "utf8");
  if (!s.includes("builtin_id: form.builtin_id")) {
    const anchor = `    return {
      form_id: form.id, blueprint: bp.id, cefr: bp.cefr, title: builtin.title,
      questions: form.questions, coverage: cov,
    };`;
    if (!s.includes(anchor)) throw new Error("core return anchor missing");
    s = s.replace(anchor, `    return {
      form_id: form.id, builtin_id: form.builtin_id, blueprint: bp.id, cefr: bp.cefr,
      title: builtin.title, questions: form.questions, coverage: cov,
    };`);
    fs.writeFileSync(fp, s, "utf8");
    console.log("core return updated");
  } else console.log("core return skip");
}
// api 类型加 builtin_id
{
  const fp = "src/api.ts";
  let s = fs.readFileSync(fp, "utf8");
  if (!s.includes("builtin_id: string;")) {
    const anchor = `export interface AssessmentStart {
  form_id: string; blueprint: string; cefr: string; title: string;`;
    if (!s.includes(anchor)) throw new Error("api type anchor missing");
    s = s.replace(anchor, `export interface AssessmentStart {
  form_id: string; builtin_id: string; blueprint: string; cefr: string; title: string;`);
    fs.writeFileSync(fp, s, "utf8");
    console.log("api type updated");
  } else console.log("api type skip");
}
