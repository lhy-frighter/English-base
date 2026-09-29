const fs = require("fs");
const path = require("path");
const fp = path.resolve(__dirname, "..", "test", "s9-session.cjs");
let s = fs.readFileSync(fp, "utf8");
const anchor = 'reopened.user.close();\nfs.rmSync(dir, { recursive: true, force: true });';
const add = `// —— 8. 存量回填（旧文章一次性补快照/相遇，且标记 backfilled）——
reopened.user.prepare("DELETE FROM coverage_assessments WHERE text_id=?").run(a2.text_id);
reopened.user.prepare("DELETE FROM unknown_encounters WHERE text_id=?").run(a2.text_id);
const covN = reopened.backfillCoverageAssessments();
const unkN = reopened.backfillUnknownEncounters();
const cov2 = reopened.user.prepare("SELECT * FROM coverage_assessments WHERE text_id=? AND kind='first_annotate'").get(a2.text_id);
check("回填覆盖率快照且标记 backfilled", covN >= 1 && cov2 && JSON.parse(cov2.snapshot_json).backfilled === true);
check("回填漏网词相遇", unkN >= 1 && reopened.user.prepare("SELECT COUNT(*) n FROM unknown_encounters WHERE text_id=?").get(a2.text_id).n > 0);
check("回填幂等（再次执行 coverage 不重复）", reopened.backfillCoverageAssessments() === 0);

reopened.user.close();
fs.rmSync(dir, { recursive: true, force: true });`;
if (!s.includes(anchor)) throw new Error("anchor missing");
if (!s.includes("存量回填")) { s = s.replace(anchor, add); fs.writeFileSync(fp, s, "utf8"); console.log("patched"); }
else console.log("skip");
