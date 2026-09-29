// S9-2 断点续学回归：resume_state UPSERT/读取/校验/删文级联
// 运行：node test/s9-resume.cjs
const { Core } = require("../core.cjs");
const path = require("node:path");
const fs = require("node:fs"), os = require("node:os");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s9-resume-"));
const core = new Core(dir);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  console.log(cond ? "PASS" : "FAIL", name, extra ?? "");
  cond ? pass++ : fail++;
}
function rejects(name, fn) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  check(name, threw);
}

// 1. 首次写入
const r1 = core.saveResumeState("reading", 11, { pi: 7, ch: 320 }, "hash-aaa");
check("写入返回 DTO（scope/refId/locator/hash）",
  r1.scope === "reading" && r1.refId === "11" && r1.locator.pi === 7 && r1.locator.ch === 320 && r1.contentHash === "hash-aaa");
check("每 scope 仅一行", core.user.prepare("SELECT COUNT(*) n FROM resume_state").get().n === 1);

// 2. UPSERT 覆盖（换文章/新位置）
const t0 = r1.updatedAt;
const r2 = core.saveResumeState("reading", 12, { pi: 0, ch: 12 }, "hash-bbb");
check("UPSERT 覆盖同一 scope（refId/hash 更新、仍一行）",
  r2.refId === "12" && r2.locator.pi === 0 && core.user.prepare("SELECT COUNT(*) n FROM resume_state").get().n === 1);
check("updatedAt 单调", r2.updatedAt >= t0);

// 3. 读取
const got = core.getResumeState("reading");
check("getResumeState 读回最新行", got && got.refId === "12" && got.contentHash === "hash-bbb");
check("无 shadow 行时返回 null", core.getResumeState("shadow") === null);

// 4. shadow 独立一行
core.saveResumeState("shadow", "shadow", { sentence: 3 }, "");
check("reading 与 shadow 各一行", core.user.prepare("SELECT COUNT(*) n FROM resume_state").get().n === 2);

// 5. 非法输入
rejects("非法 scope 写入被拒", () => core.saveResumeState("exam", 1, { pi: 1 }));
rejects("非法 scope 读取被拒", () => core.getResumeState("exam"));
rejects("坏 locator JSON 被拒", () => core.saveResumeState("reading", 1, "{bad"));

// 6. 删文级联：scope=reading 指向被删文章时清除
const a = core.annotateAndSave("Some fresh article text about science and research methods here.", "T");
core.saveResumeState("reading", a.text_id, { pi: 0, ch: 5 }, "h");
check("删文前置位存在", core.getResumeState("reading")?.refId === String(a.text_id));
core.deleteText(a.text_id);
check("删除文章后 reading 断点级联清除", core.getResumeState("reading") === null);
check("shadow 断点不受删文影响", core.getResumeState("shadow") !== null);

core.user.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
